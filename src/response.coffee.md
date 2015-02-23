ESL response and associated API
-------------------------------

    Promise = require 'bluebird'
    util = require 'util'
    {EventEmitter} = require 'events'
    debug = (require 'debug') 'esl:response'

    class FreeSwitchError extends Error
      constructor: (@res,@args) ->
        super JSON.stringify @args

    module.exports = class FreeSwitchResponse
      constructor: (@socket) ->
        @ev = new EventEmitter()
        @queue ?= new Promise.resolve null

      emit: ->
        debug 'emit', arguments[0], headers:arguments[1]?.headers, body:arguments[1]?.body
        outcome = @ev.emit arguments...
        debug emit:arguments[0], had_listeners:outcome
        outcome

      once: (event) ->
        debug 'create_once', event
        p = new Promise (resolve,reject) =>
          try
            @ev.once event, =>
              debug 'once', event, data:arguments[0]
              resolve arguments...
              return
          catch exception
            reject exception
        p.bind this

      on: (event,callback) ->
        debug 'create_on', event
        @ev.on event, -> callback.apply this, arguments

      write: (command,args) ->
        debug 'write', {command,args}

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

          try
            @once 'freeswitch_command_reply'
            .then (res) ->
              debug 'send: reply', res, {command,args}
              reply = res.headers['Reply-Text']
              if not reply?
                debug 'send: no reply', {command, args}
                reject new FreeSwitchError res, {when:'no reply to command',command,args}
                return

              if reply.match /^-/
                debug 'send: failed', reply
                reject new FreeSwitchError res, {when:'command reply',reply,command,args}
                return

              resolve res
              return

            @write command, args
          catch exception
            reject exception

        p.bind this

      end: () ->
        debug 'end'
        @socket.end()
        this

### Channel-level commands

Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands)

      api: (command) ->
        debug 'api', {command}

        p = new Promise (resolve,reject) =>
          try
            @once 'freeswitch_api_response'
            .then (res) ->
              debug 'api: response', {command}
              reply = res.body
              if not reply?
                debug 'api: no reply', {command}
                reject new FreeSwitchError res, {when:'no reply to api',command}
                return

              if reply.match /^-/
                debug 'api response failed', {reply, command}
                reject new FreeSwitchError res, {when:'api response',reply,command}
                return

              res.uuid = (reply.match /^\+OK ([\da-f-]{36})/)?[1]

              resolve res, reply
              return

            @write "api #{command}"
          catch exception
            reject exception

        p.bind this

Send an API command in the background.

      bgapi: (command) ->

        p = new Promise (resolve,reject) =>
          try
            @send "bgapi #{command}"
            .then (res) ->
              reply = res.headers['Reply-Text']
              r = reply?.match(/\+OK Job-UUID: (.+)$/)?[1]
              r ?= res.headers['Job-UUID']

The promise will receive the Job UUID (instead of the usual response).

              if r?
                res.uuid = r
                resolve res, r
                return
              else
                reject new FreeSwitchError res, {when:"bgapi did not provide a Job-UUID",command}
                return
          catch exception
            reject exception

        p.bind this

### Event reception and filtering

      event_json: (events...) ->

Request that the server send us events in JSON format.
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

Send the `exit` command to the FreeSwitch socket.
FreeSwitch will respond with "+OK bye" followed by a `disconnect-notice` message, which gets translated into a `freeswitch_disconnect_notice` event internally, which in turn gets translated into either `freeswitch_disconnect` or `freeswitch_linger`.
You normally do not need to call `@exit` directly.

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
        event = if uuid?
            "CHANNEL_EXECUTE_COMPLETE #{uuid} #{app_name} #{app_arg}"
          else
            "CHANNEL_EXECUTE_COMPLETE #{app_name} #{app_arg}"
        result = @once event
        @execute_uuid uuid,app_name,app_arg
        .then ->
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
        .then (res) =>
          debug 'auto_cleanup: Received ESL disconnection notice', res
          switch res.headers['Content-Disposition']
            when 'linger'
              debug 'Sending freeswitch_linger'
              @emit 'freeswitch_linger'
            when 'disconnect'
              debug 'Sending freeswitch_disconnect'
              @emit 'freeswitch_disconnect'
            else # Header might be absent?
              debug 'Sending freeswitch_disconnect'
              @emit 'freeswitch_disconnect'

#### Linger
The default behavior in linger mode is to disconnect the call (which is roughly equivalent to not using linger mode).

        @once 'freeswitch_linger'
        .then ->
          debug 'auto_cleanup/linger: exit'
          @exit()
          @emit 'cleanup_linger'

Use `call.once("freeswitch_linger",...)` to capture the end of the call. In this case you are responsible for calling `call.exit()`. If you do not do it, the calls will leak.

#### Disconnect

Normal behavior on disconnect is to end the call.  (However you may capture the `freeswitch_disconnect` event as well.)

        @once 'freeswitch_disconnect'
        .then ->
          debug 'auto_cleanup/disconnect: end'
          @end()
          @emit 'cleanup_disconnect', this

        return

Make the following methods queue-able.

    queueable = ['api']

    for method in queueable
      FreeSwitchResponse.prototype["queue_#{method}"] = (args...) ->

Add the function call.

        instance = @queue.then =>
          this[method].apply this, args

Do not fail the queue if a given command fails.

        @queue = instance.catch (error) =>
          debug "queued #{method} failed", {error}

Return the (uncaught) command so that the user can do error handling.

        instance
