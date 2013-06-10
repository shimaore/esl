ESL response and associated API
-------------------------------

    Q = require 'q'

    exports.debug = false

    if exports.debug
      util = require 'util'
      debug = (o) ->
        util.log util.inspect o


    module.exports = class eslResponse
      constructor: (@socket,@headers,@body) ->

      register_callback: (event,cb) ->
        @socket.removeAllListeners event
        @socket.on event, (res) =>
          @socket.removeAllListeners event
          cb res

A generic way of sending commands to FreeSwitch.
`send (string,array,function(){})`
This is normally not used directly.

      send: (command,args,cb) ->

The array parameter is optional.

        if typeof args is 'function' and not cb?
          [cb,args] = [args,null]

        if exports.debug
          util.log util.inspect command: command, args: args

The callabck parameter is optional.

        deferred = Q.defer()
        @register_callback 'esl_command_reply', (call) ->
          deferred.resolve call
          cb? call

Send the command out.

        try
          @socket.write "#{command}\n"
          if args?
            for key, value of args
              @socket.write "#{key}: #{value}\n"
          @socket.write "\n"
        catch e
          deferred.reject e
          @socket.emit 'esl_error', error:e

        deferred.promise

      on: (event,listener) ->
        deferred = Q.defer()
        @socket.on event, (args...) ->
          deferred.resolve args...
          listener? args...
        deferred.promise

      end: () -> @socket.end()

### Channel-level commands

      api: (command,cb) ->

Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands)

        if cb? then @register_callback 'esl_api_response', cb
        @send "api #{command}"

      bgapi: (command,cb) ->

Send an API command in the background.

        @register_callback 'esl_command_reply', (res) ->

The callback will receive the Job UUID (instead of the usual response).

          r = res.headers['Reply-Text']?.match /\+OK Job-UUID: (.+)$/
          cb? r[1]
        @send "bgapi #{command}"

### Event reception and filtering

      event_json: (events...,cb) ->

Request that the server send us events in JSON format.
(For all useful purposes this is the only supported format in this module.)
For example: `res.event_json 'HEARTBEAT'`

        @send "event json #{events.join(' ')}", cb

      nixevent: (events...,cb) ->

Remove the given event types from the events ACL.

        @send "nixevent #{events.join(' ')}", cb

      noevents: (cb) ->

Remove all events types.

        @send "noevents", cb

      filter: (header,value,cb) ->

Generic event filtering

        @send "filter #{header} #{value}", cb

      filter_delete: (header,value,cb) ->
        if value?
          @send "filter delete #{header} #{value}", cb
        else
          @send "filter delete #{header}", cb

      sendevent: (event_name,args,cb) ->

Send an event into the FreeSwitch event queue.

        @send "sendevent #{event_name}", args, cb

Authenticate, typically used in a client:
```
client = esl.createClient()
client.on 'esl_auth_request', (call) ->
  call.auth 'ClueCon', ->
  # Start sending other commands here.
  client.connect ...
```

      auth: (password,cb)       -> @send "auth #{password}", cb

connect() and linger() are used in server mode.

      connect: (cb)             -> @send "connect", cb    # Outbound mode

      linger: (cb)              -> @send "linger", cb     # Outbound mode

Send the exit command to the FreeSwitch socket.
      exit: (cb)                -> @send "exit", cb

### Event logging commands

      log: (level,cb) ->
        [level,cb] = [null,level] if typeof(level) is 'function'
        if level?
          @send "log #{level}", cb
        else
          @send "log", cb

      nolog: (cb)                 -> @send "nolog", cb

### Message sending

      sendmsg_uuid: (uuid,command,args,cb) ->

Send Message (to a UUID)

        options = args ? {}
        options['call-command'] = command
        execute_text = if uuid? then "sendmsg #{uuid}" else 'sendmsg'
        @send execute_text, options, cb

Send Message, assuming server/outbound ESL mode:

      sendmsg: (command,args,cb) -> @sendmsg_uuid null, command, args, cb

### Client-mode ("inbound") commands

The target UUID must be specified.

Execute an application for the given UUID (in client mode)

      execute_uuid: (uuid,app_name,app_arg,cb) ->
        options =
          'execute-app-name': app_name
          'execute-app-arg':  app_arg
        @sendmsg_uuid uuid, 'execute', options, cb

Execute an application synchronously.
The callback is only called when the command has completed.

      command_uuid: (uuid,app_name,app_arg,cb) ->
        if cb?
          event = "CHANNEL_EXECUTE_COMPLETE #{app_name} #{app_arg}"
          @register_callback event, cb
        @execute_uuid uuid,app_name,app_arg

Hangup a call

      hangup_uuid: (uuid,hangup_cause,cb) ->
        hangup_cause ?= 'NORMAL_UNSPECIFIED'
        options =
          'hangup-cause': hangup_cause
        @sendmsg_uuid uuid, 'hangup', options, cb

      unicast_uuid: (uuid,args,cb) ->
        @sendmsg_uuid uuid, 'unicast', args, cb

TODO `nomedia_uuid`

### Server-mode commands

The target UUID is our (own) call UUID.

Execute an application for the current UUID (in server/outbound mode)

      execute: (app_name,app_arg,cb)  -> @execute_uuid null, app_name, app_arg, cb
      command: (app_name,app_arg,cb)  -> @command_uuid null, app_name, app_arg, cb

      hangup: (hangup_cause,cb)       -> @hangup_uuid  null, hangup_cause, cb

      unicast: (args,cb)              -> @unicast_uuid null, args, cb

TODO: `nomedia`

Clean-up at the end of the connection.

      auto_cleanup: ->
        @on 'esl_disconnect_notice', (call) =>
          if exports.debug
            util.log "Received ESL disconnection notice"
          switch call.headers['Content-Disposition']
            when 'linger'
              if exports.debug then util.log "Sending esl_linger"
              @socket.emit 'esl_linger', call
            when 'disconnect'
              if exports.debug then util.log "Sending esl_disconnect"
              @socket.emit 'esl_disconnect', call

### Linger
The default behavior in linger mode is to disconnect the call (which is roughly equivalent to not using linger mode).

        @on 'esl_linger', => @exit()

Use `call.register_callback("esl_linger",...)` to capture the end of the call. In this case you are responsible for calling `call.exit()`. If you do not do it, the calls will leak.

### Disconnect

Normal behavior on disconnect is to end the call.  (However you may capture the `esl_disconnect` event as well.)

        @on 'esl_disconnect', => @end()
