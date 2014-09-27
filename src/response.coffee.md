ESL response and associated API
-------------------------------

    Promise = require 'bluebird'
    util = require 'util'

    module.exports = class FreeSwitchResponse
      constructor: (@socket) ->

### Tracing and debugging

The trace method will trace exchanges with the FreeSwitch server.

      trace: (logger) ->
        if logger is on
          @_trace = (o) ->
            util.log util.inspect o
          return
        if logger is off
          delete @_trace
          return
        if typeof logger is 'function'
          @_trace = logger
        if typeof logger is 'string'
          @_trace = (o) ->
            util.log logger + util.inspect o

The debug method will provide tracing inside the module's code. (The trace method must have been called first.)

      debug: (status) ->
        if status
          @_debug = (o) -> @_trace? o
        else
          delete @_debug

      once: (event) ->
        p = new Promise (resolve,reject) =>
          @socket.once event, =>
            @_trace? {event,headers:@headers,body:@body}
            resolve event
        p.bind this


      write: (command,args) ->
        @_trace? command: command, args: args

        text = "#{command}\n"
        if args?
          for key, value of args
            text += "#{key}: #{value}\n"
        text += "\n"
        @socket.write text


A generic way of sending commands to FreeSwitch.
`send (string,array,function(){})`
This is normally not used directly.

      send: (command,args) ->

        p = new Promise (resolve,reject) =>

Typically `command/reply` will contain the status in the `Reply-Text` header while `api/response` will contain the status in the body.

          @once 'freeswitch_command_reply'
          .then ->
            @_debug? {when:'command reply', command, args, call:this}
            reply = @headers['Reply-Text']
            if not reply?
              @_debug? {when:'command failed', why:'no reply', command, args}
              ## At least `exit` will not return a reply.
              # deferred.reject new Error "no reply to command #{command} #{args}"
              # return

            if reply?.match /^-ERR/
              @_debug? {when:'command failed', reply}
              reject new Error util.inspect {when:'command reply',reply,command,args}
            else
              resolve reply

          @write command, args

        p.bind this

      end: () ->
        @_debug? when:'end'
        @socket.end()
        this

### Channel-level commands

Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands)

      api: (command) ->
        @_debug? when:'api', command: command

        p = new Promise (resolve,reject) =>
          @once 'freeswitch_api_response'
          .then ->
            @_debug? when: 'api response', command:command, call:this
            reply = @body
            if not reply?
              @_debug? {when:'api failed', why:'no reply', command}
              reject new Error "no reply to api #{command}"
              return

            if reply?.match /^-ERR/
              @_debug? {when:'api response failed', reply, command}
              reject new Error util.inspect {when:'api response',reply,command}
            else
              resolve reply

          @write "api #{command}"

        p.bind this

Send an API command in the background.

      bgapi: (command) ->

        p = new Promise (resolve,reject) =>
          @send "bgapi #{command}"
          .then (res) ->
            reply = res.headers['Reply-Text']
            r = reply?.match /\+OK Job-UUID: (.+)$/

The promise will receive the Job UUID (instead of the usual response).

            if r? and r[1]?
              resolve r[1]
            else
              reject new Error "bgapi #{command} did not provide a Job-UUID."

        p.bind this

### Event reception and filtering

      event_json: (events...) ->

Request that the server send us events in JSON format.
(For all useful purposes this is the only supported format in this module.)
For example: `res.event_json 'HEARTBEAT'`

        @send "event json #{events.join(' ')}"

      nixevent: (events...) ->

Remove the given event types from the events ACL.

        @send "nixevent #{events.join(' ')}"

      noevents: ->

Remove all events types.

        @send "noevents"

      filter: (header,value) ->

Generic event filtering

        @send "filter #{header} #{value}"

      filter_delete: (header,value) ->
        if value?
          @send "filter delete #{header} #{value}"
        else
          @send "filter delete #{header}"

      sendevent: (event_name,args) ->

Send an event into the FreeSwitch event queue.

        @send "sendevent #{event_name}", args

Authenticate:

      auth: (password)       -> @send "auth #{password}"

connect() and linger() are used in server mode.

      connect: -> @send "connect"    # Outbound mode

      linger: -> @send "linger"     # Outbound mode

Send the exit command to the FreeSwitch socket.

      exit: -> @send "exit"

### Event logging commands

      log: (level) ->
        if level?
          @send "log #{level}"
        else
          @send "log"

      nolog: -> @send "nolog"

### Message sending

      sendmsg_uuid: (uuid,command,args) ->

Send Message (to a UUID)

        options = args ? {}
        options['call-command'] = command
        execute_text = if uuid? then "sendmsg #{uuid}" else 'sendmsg'
        @send execute_text, options

Send Message, assuming server/outbound ESL mode:

      sendmsg: (command,args) -> @sendmsg_uuid null, command, args

### Client-mode ("inbound") commands

The target UUID must be specified.

Execute an application for the given UUID (in client mode)

      execute_uuid: (uuid,app_name,app_arg) ->
        options =
          'execute-app-name': app_name
          'execute-app-arg':  app_arg
        @sendmsg_uuid uuid, 'execute', options

Execute an application synchronously.
The callback is only called when the command has completed.

      command_uuid: (uuid,app_name,app_arg) ->
        app_arg ?= ''
        event = "CHANNEL_EXECUTE_COMPLETE #{app_name} #{app_arg}"
        result = @once event
        @execute_uuid uuid,app_name,app_arg
        result

Hangup a call

      hangup_uuid: (uuid,hangup_cause) ->
        hangup_cause ?= 'NORMAL_UNSPECIFIED'
        options =
          'hangup-cause': hangup_cause
        @sendmsg_uuid uuid, 'hangup', options

      unicast_uuid: (uuid,args) ->
        @sendmsg_uuid uuid, 'unicast', args

TODO `nomedia_uuid`

### Server-mode commands

The target UUID is our (own) call UUID.

Execute an application for the current UUID (in server/outbound mode)

      execute: (app_name,app_arg)  -> @execute_uuid null, app_name, app_arg
      command: (app_name,app_arg)  -> @command_uuid null, app_name, app_arg

      hangup: (hangup_cause)       -> @hangup_uuid  null, hangup_cause

      unicast: (args)              -> @unicast_uuid null, args

TODO: `nomedia`

### Cleanup at end of call

Clean-up at the end of the connection.

      auto_cleanup: ->
        @once 'freeswitch_disconnect_notice'
        .then ->
          @_debug? "Received ESL disconnection notice"
          switch @headers['Content-Disposition']
            when 'linger'
              @_debug? "Sending freeswitch_linger"
              @socket.emit 'freeswitch_linger', this
            when 'disconnect'
              @_debug? "Sending freeswitch_disconnect"
              @socket.emit 'freeswitch_disconnect', this

#### Linger
The default behavior in linger mode is to disconnect the call (which is roughly equivalent to not using linger mode).

        @once 'freeswitch_linger'
        .then ->
          @_debug? when:'auto_cleanup/linger: exit'
          @exit()

Use `call.once("freeswitch_linger",...)` to capture the end of the call. In this case you are responsible for calling `call.exit()`. If you do not do it, the calls will leak.

#### Disconnect

Normal behavior on disconnect is to end the call.  (However you may capture the `freeswitch_disconnect` event as well.)

        @once 'freeswitch_disconnect'
        .then ->
          @_debug? when:'auto_cleanup/disconnect: end'
          @end()

        return
