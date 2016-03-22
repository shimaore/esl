Response and associated API
===========================

    class FreeSwitchError extends Error
      constructor: (@res,@args) ->
        super JSON.stringify @args

    module.exports = class FreeSwitchResponse

The `FreeSwitchResponse` is bound to a single socket (dual-stream). For outbound (server) mode this would represent a single socket call from FreeSwitch.

      constructor: (@socket) ->

        assert @socket?, 'Missing socket parameter'

The object provides `on`, `once`, and `emit` methods, which rely on an [`EventEmitter`](http://nodejs.org/api/events.html#events_class_events_eventemitter) object for dispatch.

        @ev = new EventEmitter()

The object also provides a queue for operations which need to be submitted one after another on a given socket because FreeSwitch does not provide ways to map event socket requests and responses in the general case.

        @__queue = Promise.resolve null

We also must track connection close in order to prevent writing to a closed socket.

        @closed = false
        @socket.on 'close', =>
          @closed = true
          trace 'Socket closed'
          @emit 'socket-close'

Default handler for `error` events to prevent `Unhandled 'error' event` reports.

        @socket.on 'error', (err) =>
          debug 'Socket Error', {err}
          @emit 'socket-error', err

        @__later = {}

        null

      error: (res,data) ->
        debug "error", {res,data}
        Promise
          .reject new FreeSwitchError res, data
          .bind this

Queueing
========

Enqueue a function that returns a Promise.
The function is only called when all previously enqueued functions-that-return-Promises are completed and their respective Promises fulfilled or rejected.

      enqueue: (f) ->
        new Promise (resolve,reject) =>
          fulfilled = (p) -> resolve p
          rejected = (e) -> reject e
          @__queue = @__queue
            .then -> f()
            .then fulfilled
            .catch rejected
        .bind this

Event Emitter
=============

emit
----

A single wrapper for EventEmitter.emit().

      emit: ->
        trace 'emit', arguments[0], headers:arguments[1]?.headers, body:arguments[1]?.body
        outcome = @ev.emit arguments...
        trace emit:arguments[0], had_listeners:outcome
        outcome

once
----

Wraps EventEmitter.once() into a Promise; this allows you to write for example

```javascript
this.once('CHANNEL_COMPLETE').then(save_cdr).then(stop_recording);
```

      once: (event,cb) ->
        trace 'create_once', event
        p = new Promise (resolve,reject) =>
          try
            @ev.once event, =>
              trace 'once', event, data:arguments[0]
              resolve arguments...
              return
            null
          catch exception
            reject exception
        p = p.bind this

In some cases the event might have been emitted before we are ready to receive it.
In that case we store the data in `@__later` so that we can emit the event when the recipient is ready.

        if event of @__later
          @emit event, @__later[event]
          delete @__later[event]

        if cb?
          return p.then cb

        return p

emit_later
----------

This is used for events that might trigger before we set the `once` receiver.

      emit_later: (event,data) ->
        trace 'emit_later', {event, data}
        if not @emit event, data
          @__later[event] = data

on
--

A simple wrapper for EventEmitter.on().

      on: (event,callback) ->
        trace 'create_on', event
        @ev.on event, =>
          trace 'on', event, data:arguments[0]
          callback.apply this, arguments
          return

Low-level sending
=================

These methods are normally not used directly.

write
-----

Send a single command to FreeSwitch; `args` is a hash of headers sent with the command.

      write: (command,args) ->
        if @closed
          return @error {}, {when:'write on closed socket',command,args}

        p = new Promise (resolve,reject) =>
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
            reject error

        p.bind this

send
----

A generic way of sending commands to FreeSwitch, wrapping `write` into a Promise that waits for FreeSwitch's notification that the command completed.

      send: (command,args) ->

        if @closed
          return @error {}, {when:'send on closed socket',command,args}

Typically `command/reply` will contain the status in the `Reply-Text` header while `api/response` will contain the status in the body.

        @enqueue =>
          p = @once 'freeswitch_command_reply'
            .then (res) =>
              return if not res?
              trace 'send: received reply', res, {command,args}
              reply = res.headers['Reply-Text']

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

          q = @write command, args

          q.then -> p

end
---

Closes the socket.

      end: () ->
        trace 'end'
        @closed = true
        @socket.end()
        this

Channel-level commands
======================

api
---

Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands) for a list.
Returns a Promise that is fulfilled as soon as FreeSwitch sends a reply. Requests are queued and each request is matched with the first-coming response, since there is no way to match between requests and responses.
Use `bgapi` if you need to make sure responses are correct, since it provides the proper semantices.

      api: (command) ->
        trace 'api', {command}

        if @closed
          return @error {}, {when:'api on closed socket',command}

        @enqueue =>
          p = @once 'freeswitch_api_response'
            .then (res) =>
              return if not res?
              trace 'api: response', {command}
              reply = res.body

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

          q = @write "api #{command}"

          q.then -> p

bgapi
-----

Send an API command in the background. Wraps it inside a Promise.

      bgapi: (command) ->
        trace 'bgapi', {command}

        if @closed
          return @error {}, {when:'bgapi on closed socket',command}

        @send "bgapi #{command}"
        .then (res) =>
          error = => @error res, {when:"bgapi did not provide a Job-UUID",command}

          return error() unless res?
          reply = res.headers['Reply-Text']
          r = reply?.match(/\+OK Job-UUID: (.+)$/)?[1]
          r ?= res.headers['Job-UUID']
          return error() unless r?

          trace 'bgapi retrieve', r

          @once "BACKGROUND_JOB #{r}"

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

      connect: -> @send "connect"    # Outbound mode

linger
------

Used in server mode, requests FreeSwitch to not close the socket as soon as the call is over, allowing us to do some post-processing on the call (mainly, receiving call termination events).
By default, `esl` with call `exit()` for you after 4 seconds. You need to capture the `cleanup_linger` event if you want to handle things differently.

      linger: -> @send "linger"     # Outbound mode

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

      execute_uuid: (uuid,app_name,app_arg,loops) ->
        options =
          'execute-app-name': app_name
          'execute-app-arg':  app_arg
        options.loops = loops if loops?
        @sendmsg_uuid uuid, 'execute', options

TODO: Support the alternate format (with no `execute-app-arg` header but instead a `text/plain` body containing the argument).

command_uuid
------------

Execute an application synchronously. Return a Promise.

      command_uuid: (uuid,app_name,app_arg) ->
        app_arg ?= ''
        event = if uuid?
            "CHANNEL_EXECUTE_COMPLETE #{uuid} #{app_name} #{app_arg}"
          else
            "CHANNEL_EXECUTE_COMPLETE #{app_name} #{app_arg}"

The Promise is only fulfilled when the command has completed.

        result = @once event
        @execute_uuid uuid,app_name,app_arg
        .then ->
          result

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
        @once 'freeswitch_disconnect_notice', (res) =>
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

### Linger

In linger mode you may intercept the event `cleanup_linger` to do further processing. However you are responsible for calling `exit()`. If you do not do it, the calls will leak. (Make sure you also `catch` any errors on exit: `exit().catch(...)`.)

The default behavior in linger mode is to disconnect the socket after 4 seconds, giving you some time to capture events.

        linger_delay = 4000

        @once 'freeswitch_linger', ->
          trace 'auto_cleanup/linger'
          if @emit 'cleanup_linger'
            debug 'auto_cleanup/linger: cleanup_linger processed, make sure you call exit()'
          else
            trace "auto_cleanup/linger: exit() in #{linger_delay}ms"
            Promise.delay linger_delay
            .bind this
            .then ->
              trace 'auto_cleanup/linger: exit()'
              @exit()
            .catch (error) ->
              debug "auto_cleanup/linger: exit() error: #{error} (ignored)"

### Disconnect

On disconnect (no linger) mode, you may intercept the event `cleanup_disconnect` to do further processing. However you are responsible for calling `end()` in order to close the socket.

Normal behavior on disconnect is to close the socket with `end()`.

        @once 'freeswitch_disconnect', ->
          trace 'auto_cleanup/disconnect'
          if @emit 'cleanup_disconnect', this
            debug 'auto_cleanup/disconnect: cleanup_disconnect processed, make sure you call end()'
          else
            trace 'auto_cleanup/disconnect: end()'
            @end()

        return null

Toolbox
=======

    Promise = require 'bluebird'
    assert = require 'assert'
    {EventEmitter} = require 'events'
    debug = (require 'debug') 'esl:response'
    trace = (require 'debug') 'esl:response:trace'
