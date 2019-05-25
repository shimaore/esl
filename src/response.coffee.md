Response and associated API
===========================

    {EventEmitter2} = require 'eventemitter2'
    UUID = require 'uuid'

    async_log = (msg,af) ->
      ->
        af().catch (error) ->
          console.log msg, error
          Promise.reject error

    class FreeSwitchError extends Error
      constructor: (res,args) ->
        super()
        @res = res
        @args = args
        return
      toString: ->
        "FreeSwitchError: #{JSON.stringify @args}"

    class FreeSwitchTimeout extends Error
      constructor: (timeout,text) ->
        super()
        @timeout = timeout
        @text = text
        return
      toString: ->
        "FreeSwitchTimeout: Timeout after #{@timeout}ms waiting for #{@text}"

    module.exports = class FreeSwitchResponse extends EventEmitter2

The `FreeSwitchResponse` is bound to a single socket (dual-stream). For outbound (server) mode this would represent a single socket call from FreeSwitch.

      constructor: (socket) ->
        assert socket?, 'Missing socket parameter'

        super wildcard: true, verboseMemoryLeak: true

        @socket = socket

The object also provides a queue for operations which need to be submitted one after another on a given socket because FreeSwitch does not provide ways to map event socket requests and responses in the general case.

        @__queue = Promise.resolve null

The object also provides a mechanism to report events that might already have been triggered.

        @__later = new Map

We also must track connection close in order to prevent writing to a closed socket.

        @closed = false

        @socket.once 'close', socket_once_close = =>
          debug 'Socket closed'
          @emit 'socket.close'
          return

Default handler for `error` events to prevent `Unhandled 'error' event` reports.

        @socket.on 'error', socket_on_error = (err) =>
          debug 'Socket Error', err
          @emit 'socket.error', err
          return

After the socket is closed or errored, this object is no longer usable.

        @once 'socket.*', once_socket_star = =>
          @closed = true
          @removeAllListeners()
          try await @__queue
          @__queue = null
          @__later = null
          @socket.end()
          @socket = null
          return

        null

      error: (res,data) ->
        debug "error: new FreeSwitchError", {res,data}
        Promise.reject new FreeSwitchError res, data

Event Emitter
=============

`default_event_timeout`
-----------------------

The default timeout waiting for events.

Note that this value must be longer than (for exemple) a regular call's duration, if you want to be able to catch `EXECUTE_COMPLETE` on `bridge` commands.

      default_event_timeout: 9*3600*1000 # 9 hours

      command_timeout: 10*1000 # 10s

Most commands allow you to specify a timeout.

onceAsync
---------

      onceAsync: (event,timeout,comment) ->
        trace 'onceAsync', event, timeout
        onceAsyncHandler = (resolve,reject) =>

          on_event = (args...) ->
            trace "onceAsync: on_event #{event} in #{comment}", args
            cleanup()
            resolve args...
            return

          on_error = (error) ->
            trace "onceAsync: on_error #{event}", error
            cleanup()
            reject error ? new Error "Socket closed while waiting for #{event} in #{comment}"
            return

          on_timeout = ->
            trace "onceAsync: on_timeout #{event}"
            cleanup()
            reject new FreeSwitchTimeout timeout, "event #{event} in #{comment}"
            return

          cleanup = =>
            @removeListener event, on_event
            @removeListener 'socket.*', on_error
            clearTimeout timer
            return

          @once event, on_event
          @once 'socket.*', on_error
          timer = setTimeout on_timeout, timeout if timeout?
          return

        new Promise onceAsyncHandler

Queueing
========

Enqueue a function that returns a Promise.
The function is only called when all previously enqueued functions-that-return-Promises are completed and their respective Promises fulfilled or rejected.

      enqueue: (f) ->
        if not @__queue?
          return @error {}, {when:'enqueue on closed socket'}

        unless @__queue.catch?
          throw new Error "Queue should be a Promise"

        q = @__queue
        queueHandler = =>
          await q.catch -> yes
          await f()

        @__queue = do queueHandler

Sync/Async event
================

waitAsync
---------

In some cases the event might have been emitted before we are ready to receive it.
In that case we store the data in `@__later` so that we can emit the event when the recipient is ready.

      waitAsync: (event,timeout,comment) ->

        if @__later? and @__later.has event
          v = @__later.get event
          @__later.delete event
          Promise.resolve v
        else
          @onceAsync event, timeout, "waitAsync #{comment}"

emit_later
----------

This is used for events that might trigger before we set the `once` receiver.

      emit_later: (event,data) ->
        handled = @emit event, data
        if @__later? and not handled
          @__later.set event, data
        handled

Low-level sending
=================

These methods are normally not used directly.

write
-----

Send a single command to FreeSwitch; `args` is a hash of headers sent with the command.

      write: (command,args) ->
        if @closed
          return @error {}, {when:'write on closed socket',command,args}

        writeHandler = (resolve,reject) =>
          try
            trace 'write', {command,args}

            text = "#{command}\n"
            if args?
              for key, value of args
                text += "#{key}: #{value}\n"
            text += "\n"
            @socket.write text, 'utf8'
            resolve null

          catch error

Cancel any pending Promise started with `@onceAsync`, and close the connection.

            @emit 'socket.write', error

            reject error

          return

        new Promise writeHandler

send
----

A generic way of sending commands to FreeSwitch, wrapping `write` into a Promise that waits for FreeSwitch's notification that the command completed.

      send: (command,args,timeout = @command_timeout) ->

        msg = "send #{command} #{JSON.stringify args}"

        if @closed
          return @error {}, {when:'send on closed socket',command,args}

Typically `command/reply` will contain the status in the `Reply-Text` header while `api/response` will contain the status in the body.

        sendHandler = =>
          p = @onceAsync 'freeswitch_command_reply', timeout, msg
          q = @write command, args

          [res] = await Promise.all [p,q]

          trace 'send: received reply', {command,args}
          reply = res?.headers['Reply-Text']

The Promise might fail if FreeSwitch's notification indicates an error.

          if not reply?
            trace 'send: no reply', {command, args}
            return @error res, {when:'no reply to command',command,args}

          if reply.match /^-/
            debug 'send: failed', reply, {command, args}
            return @error res, {when:'command reply',reply,command,args}

The promise will be fulfilled with the `{headers,body}` object provided by the parser.

          trace 'send: success', {command,args}
          res

        await @enqueue async_log msg, sendHandler

end
---

Closes the socket.

      end: ->
        trace 'end'
        try @emit 'socket.end'
        return

Channel-level commands
======================

api
---

Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands) for a list.
Returns a Promise that is fulfilled as soon as FreeSwitch sends a reply. Requests are queued and each request is matched with the first-coming response, since there is no way to match between requests and responses.
Use `bgapi` if you need to make sure responses are correct, since it provides the proper semantices.

      api: (command,timeout) ->
        trace 'api', {command}
        msg = "api #{command}"

        if @closed
          return @error {}, {when:'api on closed socket',command}

        apiHandler = =>
          p = @onceAsync 'freeswitch_api_response', timeout, msg
          q = @write "api #{command}"

          [res] = await Promise.all [p,q]

          trace 'api: response', {command}
          reply = res?.body

The Promise might fail if FreeSwitch indicates there was an error.

          if not reply?
            debug 'api: no reply', {command}
            return @error res, {when:'no reply to api',command}

          if reply.match /^-/
            debug 'api response failed', {reply, command}
            return @error res, {when:'api response',reply,command}

The Promise that will be fulfilled with `{headers,body,uuid}` from the parser; uuid is the API UUID if one is provided by FreeSwitch.

          res.uuid = (reply.match /^\+OK ([\da-f-]{36})/)?[1]
          res

        await @enqueue async_log msg, apiHandler

bgapi
-----

Send an API command in the background. Wraps it inside a Promise.

      bgapi: (command,timeout) ->
        trace 'bgapi', {command,timeout}

        if @closed
          return @error {}, {when:'bgapi on closed socket',command}

        res = await @send "bgapi #{command}"
        error = => @error res, {when:"bgapi did not provide a Job-UUID",command}

        return error() unless res?
        reply = res.headers['Reply-Text']
        r = reply?.match(/\+OK Job-UUID: (.+)$/)?[1]
        r ?= res.headers['Job-UUID']
        return error() unless r?

        trace 'bgapi retrieve', r

        await @waitAsync "BACKGROUND_JOB #{r}", timeout, "bgapi #{command}"

Event reception and filtering
=============================

event_json
----------

Request that the server send us events in JSON format.
For example: `res.event_json 'HEARTBEAT'`

      event_json: (events...) ->

        @send "event json #{events.join(' ')}"

nixevents
---------

Remove the given event types from the events ACL.

      nixevent: (events...) ->

        @send "nixevent #{events.join(' ')}"

noevents
--------

Remove all events types.

      noevents: ->

        @send "noevents"

filter
------

Generic event filtering

      filter: (header,value) ->

        @send "filter #{header} #{value}"

filter_delete
-------------

Remove a filter.

      filter_delete: (header,value) ->
        if value?
          @send "filter delete #{header} #{value}"
        else
          @send "filter delete #{header}"

sendevent
---------

Send an event into the FreeSwitch event queue.

      sendevent: (event_name,args) ->

        @send "sendevent #{event_name}", args

Connection handling
===================

auth
----

Authenticate with FreeSwitch.

This normally not needed since in outbound (server) mode authentication is not required, and for inbound (client) mode the module authenticates automatically when requested.

      auth: (password)       -> @send "auth #{password}"

connect
-------

Used in server mode to start the conversation with FreeSwitch.

Normally not needed, triggered automatically by the module.

      connect: -> @send "connect"   # Outbound mode

linger
------

Used in server mode, requests FreeSwitch to not close the socket as soon as the call is over, allowing us to do some post-processing on the call (mainly, receiving call termination events).
By default, `esl` with call `exit()` for you after 4 seconds. You need to capture the `cleanup_linger` event if you want to handle things differently.

      linger: -> @send "linger"    # Outbound mode

exit
----

Send the `exit` command to the FreeSwitch socket.
FreeSwitch will respond with "+OK bye" followed by a `disconnect-notice` message, which gets translated into a `freeswitch_disconnect_notice` event internally, which in turn gets translated into either `freeswitch_disconnect` or `freeswitch_linger` depending on whether `linger` was called on the socket.
You normally do not need to call `@exit` directly. If you do, make sure you do handle any rejection.

      exit: -> @send "exit"

Event logging
=============

log
---

Enable logging on the socket, optionnally setting the log level.

      log: (level) ->
        if level?
          @send "log #{level}"
        else
          @send "log"

nolog
-----

Disable logging on the socket.

      nolog: -> @send "nolog"

Message sending
===============

sendmsg_uuid
------------

Send a command to a given UUID.

      sendmsg_uuid: (uuid,command,args) ->

        options = args ? {}
        options['call-command'] = command
        execute_text = if uuid? then "sendmsg #{uuid}" else 'sendmsg'
        @send execute_text, options

sendmsg
-------

Send Message, assuming server/outbound ESL mode (in which case the UUID is not required).

      sendmsg: (command,args) -> @sendmsg_uuid null, command, args

Client-mode ("inbound") commands
=================================

The target UUID must be specified.


execute_uuid
------------

Execute an application for the given UUID (in client mode).

      execute_uuid: (uuid,app_name,app_arg,loops,event_uuid) ->
        options =
          'execute-app-name': app_name
          'execute-app-arg':  app_arg
        options.loops = loops if loops?
        options['Event-UUID'] = event_uuid if event_uuid?
        @sendmsg_uuid uuid, 'execute', options

TODO: Support the alternate format (with no `execute-app-arg` header but instead a `text/plain` body containing the argument).

command_uuid
------------

Execute an application synchronously. Return a Promise.

      command_uuid: (uuid,app_name,app_arg,timeout = @default_command_timeout) ->
        app_arg ?= ''
        event_uuid = UUID.v4()
        event = "CHANNEL_EXECUTE_COMPLETE #{event_uuid}"

The Promise is only fulfilled when the command has completed.

        p = @onceAsync event, timeout, "uuid #{uuid} #{app_name} #{app_arg}"
        await @execute_uuid uuid,app_name,app_arg,null,event_uuid
        await p

hangup_uuid
-----------

Hangup the call referenced by the given UUID with an optional (FreeSwitch) cause code.

      hangup_uuid: (uuid,hangup_cause) ->
        hangup_cause ?= 'NORMAL_UNSPECIFIED'
        options =
          'hangup-cause': hangup_cause
        @sendmsg_uuid uuid, 'hangup', options

unicast_uuid
------------

Forwards the media to and from a given socket.

Arguments:
- `local-ip`
- `local-port`
- `remote-ip`
- `remote-port`
- `transport` (`tcp` or `udp`)
- `flags: "native"` (optional: do not transcode to/from L16 audio)

      unicast_uuid: (uuid,args) ->
        @sendmsg_uuid uuid, 'unicast', args

nomedia_uuid
------------

Not implemented yet (TODO).

Server-mode commands
====================

In server (outbound) mode, the target UUID is always our (own) call UUID, so it does not need to be specified.

execute
-------

Execute an application for the current UUID (in server/outbound mode)

      execute: (app_name,app_arg)  -> @execute_uuid null, app_name, app_arg

command
-------

      command: (app_name,app_arg)  -> @command_uuid null, app_name, app_arg


hangup
------

      hangup: (hangup_cause)       -> @hangup_uuid  null, hangup_cause

unicast
-------

      unicast: (args)              -> @unicast_uuid null, args

TODO: `nomedia`

Cleanup at end of call
======================

auto_cleanup
------------

Clean-up at the end of the connection.
Automatically called by the client and server.

      auto_cleanup: ->

        @once 'freeswitch_disconnect_notice', (res) ->
          trace 'auto_cleanup: Received ESL disconnection notice', res
          switch res.headers['Content-Disposition']
            when 'linger'
              trace 'Sending freeswitch_linger'
              @emit 'freeswitch_linger'
            when 'disconnect'
              trace 'Sending freeswitch_disconnect'
              @emit 'freeswitch_disconnect'
            else # Header might be absent?
              trace 'Sending freeswitch_disconnect'
              @emit 'freeswitch_disconnect'
          return

### Linger

In linger mode you may intercept the event `cleanup_linger` to do further processing. However you are responsible for calling `exit()`. If you do not do it, the calls will leak. (Make sure you also `catch` any errors on exit: `exit().catch(...)`.)

The default behavior in linger mode is to disconnect the socket after 4 seconds, giving you some time to capture events.

        linger_delay = 4000

        @once 'freeswitch_linger', once_freeswitch_linger = ->
          trace 'auto_cleanup/linger'
          if @emit 'cleanup_linger'
            debug 'auto_cleanup/linger: cleanup_linger processed, make sure you call exit()'
          else
            trace "auto_cleanup/linger: exit() in #{linger_delay}ms"
            setTimeout =>
              trace 'auto_cleanup/linger: exit()'
              @exit().catch -> yes
              return
            , linger_delay
          return

### Disconnect

On disconnect (no linger) mode, you may intercept the event `cleanup_disconnect` to do further processing. However you are responsible for calling `end()` in order to close the socket.

Normal behavior on disconnect is to close the socket with `end()`.

        @once 'freeswitch_disconnect', once_freeswitch_disconnect = ->
          trace 'auto_cleanup/disconnect'
          if @emit 'cleanup_disconnect', this
            debug 'auto_cleanup/disconnect: cleanup_disconnect processed, make sure you call end()'
          else
            trace 'auto_cleanup/disconnect: end()'
            try @end()
          return

        return null

Toolbox
=======

    assert = require 'assert'
    debug = (require 'debug') 'esl:response'
    trace = (require 'debug') 'esl:response:trace'
