Handler
=======

### Sending generic commands to FreeSwitch.

    {Client,Server} = require './socket'
    Response = require './response'
    Request = require './request'
    PromiseValue = require './promise-value'

    module.exports = fs =

      client: (options = {}) ->
        options.password ?= 'ClueCon'
        res = new Response new Client()
        req = new Request()
        client = new PromiseValue res, req
        client
        .on 'freeswitch_auth_request', fs.auth options.password
        return client

      server: (handler = ->) ->

        server = new Server (res,req) ->

          pv = new PromiseValue res, req

          Unique_ID = 'Unique-ID'
          unique_id = null

          pv
          .then fs.connect()
          .then (pv) ->
            unique_id = pv.body[Unique_ID]
          .then fs.filter Unique_ID, unique_id
          .then fs.event_json 'ALL'
          .then fs.command 'verbose_events'
          .then handler

        return server

      disconnect: ->
        (pv) ->
          pv.res.socket.end()


`send(string,object)` -- send and don't wait for a response.

      send: (command,args) ->
        (pv) ->
          pv
          .send command, args

`send_command(string,object)` -- send a command and wait for a response.

      send_command: (command,args) ->
        (pv) ->
          pv
          .on 'freeswitch_command_reply'
          .then fs.send command, args

### Channel-level commands

Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands)

      api: (command) ->
        (pv) ->
          pv
          .on 'freeswitch_api_response'
          .then fs.send "api #{command}"

Send an API command in the background. The optional callback will receive the Job UUID. The Job itself will terminate in the background.

      bgapi: (command,uuid_cb) ->
        (pv) ->
          pv
          .send_command "bgapi #{command}"
          .then (pv) ->
            r = pv.headers['Reply-Text']?.match /\+OK Job-UUID: (.+)$/
            uuid_cb? r[1]
            return pv

### Event reception and filtering

Request that the server send us events in JSON format. (For all useful purposes this is the only supported format in this module.)
For example: `handler.event_json 'HEARTBEAT'`

      event_json: (events...) ->
        fs.send_command "event json #{events.join(' ')}"

Remove the given event types from the events ACL.

      nixevent: (events...) ->
        fs.send_command "nixevent #{events.join(' ')}"

Remove all events types.

      noevents: ->
        fs.send_command "noevents"

Generic event filtering

      filter: (header,value) ->
        fs.send_command "filter #{header} #{value}"

      filter_delete: (header,value) ->
        if value?
          fs.send_command "filter delete #{header} #{value}"
        else
          fs.send_command "filter delete #{header}"

Send an event into the FreeSwitch event queue.

      sendevent: (event_name,args) ->
        fs.send_command "sendevent #{event_name}", args

Send the exit command to the FreeSwitch socket (and wait for it to complete).

      exit: ->
        fs.send_command "exit"

### Event logging commands

      log: (level) ->
        if level?
          fs.send_command "log #{level}"
        else
          fs.send_command "log"

      nolog: ->
        fs.send_command "nolog"

### Message sending

Send Message (to a UUID)

      sendmsg_uuid: (uuid,command,args) ->
        options = args ? {}
        options['call-command'] = command
        execute_text = if uuid? then "sendmsg #{uuid}" else 'sendmsg'
        fs.send_command execute_text, options

Send Message, assuming server/outbound ESL mode:

      sendmsg: (command,args) ->
        fs.sendmsg_uuid null, command, args

### Client-mode ("inbound") commands

      auth: (password) ->
        fs.send_command "auth #{password}"

In the following commands, the target UUID must be specified.

Execute an application for the given UUID (in client mode)

      execute_uuid: (uuid,app_name,app_arg) ->
        options =
          'execute-app-name': app_name
          'execute-app-arg':  app_arg
        fs.sendmsg_uuid uuid, 'execute', options

Execute an application synchronously.
The callback is only called when the command has completed.

      command_uuid: (uuid,app_name,app_arg) ->
        (pv) ->
          pv
          .on "CHANNEL_EXECUTE_COMPLETE #{app_name} #{app_arg}"
          .then fs.execute_uuid uuid,app_name,app_arg

Hangup a call

      hangup_uuid: (uuid,hangup_cause = 'NORMAL_UNSPECIFIED') ->
        options =
          'hangup-cause': hangup_cause
        fs.sendmsg_uuid uuid, 'hangup', options

      unicast_uuid: (uuid,args) ->
        fs.sendmsg_uuid uuid, 'unicast', args

TODO `nomedia_uuid`

### Server-mode commands

`connect()` and `linger()` are used in server mode; they are executed automatically by the server so there is no need to call them directly.

      connect: ->
        fs.send_command "connect"

#### Linger

To enable linger mode, you must first request it (generally right after `connect` is a good way to make sure the call doesn't get disconnected before you request `linger`).

      linger: ->
        (pv) ->

Default behavior on linger is to disconnect the call (which is roughly equivalent to not using linger mode).
Use `response.force_on("freeswitch_linger",...)` to capture the end of the call instead. In this case you are responsible for calling `handler.exit()`. If you do not do it, the calls will leak.

          pv.res._on 'freeswitch_linger', fs.exit()
          pv
          .then send_command "linger"

Use `response.on("freeswitch_linger",...)` to capture the end of the call. In this case you are responsible for calling `res.exit()`. If you do not do it, the calls will leak.

#### Other server-mode commands

The target UUID is our (own) call UUID.

Execute an application for the current UUID (in server/outbound mode)

      execute: (app_name,app_arg) ->
        fs.execute_uuid null, app_name, app_arg

      command: (app_name,app_arg) ->
        fs.command_uuid null, app_name, app_arg

      hangup: (hangup_cause) ->
        fs.hangup_uuid  null, hangup_cause

      unicast: (args) ->
        fs.unicast_uuid null, args

TODO: `nomedia`
