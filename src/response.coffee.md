ESL response and associated API
-------------------------------

    Q = require 'q'

    module.exports = class FreeSwitchResponse
      constructor: (@socket) ->

      trace: (logger) ->
        if logger is on
          util = require 'util'
          @_trace = (o) ->
            util.log util.inspect o
          return
        if logger is off
          delete @_trace
          return
        if typeof logger is 'function'
          @_trace = logger
        if typeof logger is 'string'
          util = require 'util'
          @_trace = (o) ->
            util.log logger + util.inspect o

      debug: (status) ->
        if status
          @_debug = (o) -> @_trace? o
        else
          delete @_debug

      once: (event) ->
        deferred = Q.defer()
        @socket.once event, (call) =>
          @_trace? {event,headers:call.headers,body:call.body}
          deferred.resolve call
        deferred.promise

A generic way of sending commands to FreeSwitch.
`send (string,array,function(){})`
This is normally not used directly.

      send: (command,args) ->

        deferred = Q.defer()

Typically `command/reply` will contain the status in the `Reply-Text` header while `api/response` will contain the status in the body.

        @once('freeswitch_command_reply').then (call) ->
          call._debug? {when:'command reply', command, args, call}
          reply = call.headers['Reply-Text']
          if reply.match /^-ERR/
            call._debug? {when:'command failed', reply}
            deferred.reject new Error reply
          else
            deferred.resolve call

        @_trace? command: command, args: args

        try
          @socket.write "#{command}\n"
          if args?
            for key, value of args
              @socket.write "#{key}: #{value}\n"
          @socket.write "\n"
        catch e
          deferred.reject e
          @socket.emit 'freeswitch_error', error:e

        deferred.promise

      end: () ->
        @_debug? when:'end'
        @socket.end()
        @

### Channel-level commands

Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands)

      api: (command) ->
        @_debug? when:'api', command: command

        deferred = Q.defer()
        @once('freeswitch_api_response').then (call) ->
          @_debug? when: 'api response', command:command, call:call
          reply = call.body
          if reply.match /^-ERR/
            @_debug? when:'api response failed', reply:reply
            deferred.reject new Error reply
          else
            deferred.resolve call

        @send "api #{command}"
        deferred.promise

Send an API command in the background.

      bgapi: (command) ->

        deferred = Q.defer()
        cmd = @send "bgapi #{command}"
        cmd.then (res) ->
          r = res.headers['Reply-Text']?.match /\+OK Job-UUID: (.+)$/

The promise will receive the Job UUID (instead of the usual response).

          if r? and r[1]?
            deferred.resolve r[1]
          else
            deferred.reject new Error "bgapi #{command} did not provide a Job-UUID."

        deferred.promise

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

Clean-up at the end of the connection.

      auto_cleanup: ->
        @once('freeswitch_disconnect_notice').then (call) ->
          @_debug? "Received ESL disconnection notice"
          switch call.headers['Content-Disposition']
            when 'linger'
              @_debug? "Sending freeswitch_linger"
              call.socket.emit 'freeswitch_linger', call
            when 'disconnect'
              @_debug? "Sending freeswitch_disconnect"
              call.socket.emit 'freeswitch_disconnect', call

### Linger
The default behavior in linger mode is to disconnect the call (which is roughly equivalent to not using linger mode).

        @once('freeswitch_linger').then (call) ->
          @_debug? when:'auto_cleanup/linger: exit'
          call.exit()

Use `call.once("freeswitch_linger",...)` to capture the end of the call. In this case you are responsible for calling `call.exit()`. If you do not do it, the calls will leak.

### Disconnect

Normal behavior on disconnect is to end the call.  (However you may capture the `freeswitch_disconnect` event as well.)

        @once('freeswitch_disconnect').then (call) ->
          @_debug? when:'auto_cleanup/disconnect: end'
          call.end()

Make `auto_cleanup` chainable.

        @

Promise toolbox
---------------

      sequence: (steps) ->
        call = @
        steps = steps.map (f) ->
          (call) ->
            call._debug? when:'next step'
            f.apply(call) ? call
        steps.reduce Q.when, Q.resolve call
