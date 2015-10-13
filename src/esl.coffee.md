Connection Listener (socket events handler)
===========================================

We use the same connection-listener for both client (FreeSwitch "inbound" socket) and server (FreeSwitch "outound" socket).
This is modelled after Node.js' http.js; the connection-listener is called either when FreeSwitch connects to our server, or when we connect to FreeSwitch from our client.

    connectionListener = (call) ->

The module provides statistics in the `stats` object. You may use it  to collect your own call-related statistics. For example the [tough-rate](https://github.com/shimaore/tough-rate) LCR engine uses this along with the [caring-band](https://github.com/shimaore/caring-band) data collection tool to provide realtime data.

      call.stats ?= {}

The parser will be the one receiving the actual data from the socket. We will process the parser's output below.

      parser = new FreeSwitchParser call.socket

Make the command responses somewhat unique. This is required since FreeSwitch doesn't provide us a way to match response with requests.

      call.on 'CHANNEL_EXECUTE_COMPLETE', (res) ->
        application = res.body['Application']
        application_data = res.body['Application-Data'] ? ''
        call.emit "CHANNEL_EXECUTE_COMPLETE #{application} #{application_data}", res
        unique_id = res.body['Unique-ID']
        if unique_id?
          call.emit "CHANNEL_EXECUTE_COMPLETE #{unique_id} #{application} #{application_data}", res

The parser is responsible for de-framing messages coming from FreeSwitch and splitting it into headers and a body.

      parser.process = (headers,body) ->

Rewrite headers as needed to work around some weirdnesses in the protocol; and assign unified event IDs to the Event Socket's Content-Types.

        content_type = headers['Content-Type']
        if not content_type?
          call.stats.missing_content_type ?= 0
          call.stats.missing_content_type++
          call.socket.emit 'error', {when: 'Missing Content-Type', headers, body}
          return

Notice how all our (internal) event names are lower-cased; FreeSwitch always uses full-upper-case event names.

        switch content_type

auth/request
------------

FreeSwitch sends an authentication request when a client connect to the Event Socket.
Normally caught by the client code, there is no need for your code to monitor this event.

          when 'auth/request'
            event = 'freeswitch_auth_request'
            call.stats.auth_request ?= 0
            call.stats.auth_request++

command/reply
-------------

Commands trigger this type of event when they are submitted.
Normally caught by `send`, there is no need for your code to monitor this event.

          when 'command/reply'
            event = 'freeswitch_command_reply'

Apparently a bug in the response to `connect` causes FreeSwitch to send the headers in the body.

            if headers['Event-Name'] is 'CHANNEL_DATA'
              body = headers
              headers = {}
              for n in ['Content-Type','Reply-Text','Socket-Mode','Control']
                headers[n] = body[n]
                delete body[n]
            call.stats.command_reply ?= 0
            call.stats.command_reply++

text/event-json
---------------

A generic event with a JSON body. We map it to its own Event-Name.

          when 'text/event-json'
            try

Strip control characters that might be emitted by FreeSwitch.

              body = body.replace /[\x00-\x1F\x7F-\x9F]/g, ''

Parse the JSON body.

              body = JSON.parse(body)

In case of error report it as an error.

            catch exception
              call.stats.json_parse_errors ?= 0
              call.stats.json_parse_errors++
              call.socket.emit 'error', when:'JSON error', error:exception, body:body
              return

Otherwise trigger the proper event.

            event = body['Event-Name']

text/event-plain
----------------

Same a `text/event-json` except the body is encoded using plain text. Either way the module provides you with a parsed body (a hash/Object).

          when 'text/event-plain'
            body = parse_header_text(body)
            event = body['Event-Name']
            call.stats.events ?= 0
            call.stats.events++

log/data
--------

          when 'log/data'
            event = 'freeswitch_log_data'
            call.stats.log_data ?= 0
            call.stats.log_data++

text/disconnect-notice
----------------------

FreeSwitch's indication that it is disconnecting the socket.
You normally do not have to monitor this event; the `autocleanup` methods catches this event and emits either `freeswitch_disconnect` or `freeswitch_linger`, monitor those events instead.

          when 'text/disconnect-notice'
            event = 'freeswitch_disconnect_notice'
            call.stats.disconnect ?= 0
            call.stats.disconnect++

api/response
------------

Triggered when an `api` message returns. Due to the inability to map those responses to requests, you might want to use `queue_api` instead of `api` for concurrent usage.
You normally do not have to monitor this event, the `api` methods catches it.

          when 'api/response'
            event = 'freeswitch_api_response'
            call.stats.api_responses ?= 0
            call.stats.api_responses++

Others?
-------

          else

Ideally other content-types should be individually specified. In any case we provide a fallback mechanism.

            debug 'Unhandled Content-Type', content_type
            event = "freeswitch_#{content_type.replace /[^a-z]/, '_'}"
            call.socket.emit 'error', when:'Unhandled Content-Type', error:content_type
            call.stats.unhandled ?= 0
            call.stats.unhandled++

Event content
-------------

The messages sent at the server- or client-level only contain the headers and the body, possibly modified by the above code.

        msg = {headers,body}

        outcome = call.emit event, msg

Get things started
------------------

Get things started: notify the application that the connection is established and that we are ready to send commands to FreeSwitch.

      call.emit 'freeswitch_connect'

Server
======

The server is used when FreeSwitch needs to be able to initiate a connection to us so that we can handle an existing call.


We inherit from the `Server` class of Node.js' `net` module. This way any method from `Server` may be re-used (although in most cases only `listen` is used).

    net = require 'net'

    class FreeSwitchServer extends net.Server
      constructor: (requestListener) ->

The server also contains a `stats` object. It records the number of connections.

        @stats = {}
        @on 'connection', (socket) ->
          @stats.connections ?= 0
          @stats.connections++

For every new connection to our server we get a new `Socket` object, which we wrap inside our `FreeSwitchResponse` object. This becomes the `call` object used throughout the application.

          call = new FreeSwitchResponse socket

The `freeswitch_connect` event is triggered by our `connectionListener` once the parser is set up and ready.

          call.once 'freeswitch_connect'
          .then ->

The request-listener is called within the context of the `FreeSwitchResponse` object.

            try
              requestListener.call call

All errors are reported directly on the socket; even though `FreeSwitchResponse` contains an `EventEmitter` we don't use it for error notification.

            catch exception
              call.socket.emit 'error', exception

The connection-listener is called last to set the parser up and trigger the request-listener.

          connectionListener call

        super()

The `server` we export is only slightly more complex. It sets up a filter so that the application only gets its own events, and sets up automatic cleanup which will be used before disconnecting the socket.
The call handler will receive a `FreeSwitchResponse` object, `options` are optional (and currently unused).

    exports.server = (options = {}, handler, report = error) ->
      if typeof options is 'function'
        [options,handler] = [{},options]

      assert.ok handler?, "server handler is required"
      assert.strictEqual typeof handler, 'function', "server handler must be a function"

      server = new FreeSwitchServer ->

Here starts our default request-listener.

        try
          Unique_ID = 'Unique-ID'
          server.stats.connecting ?= 0
          server.stats.connecting++

Confirm connection with FreeSwitch.

          @connect()
          .then (res) ->
            @data = res.body
            @uuid = @data[Unique_ID]

Restricting events using `filter` is required so that `event_json` will only obtain our events.

            @filter Unique_ID, @uuid
          .then ->
            @auto_cleanup()
            server.stats.handler ?= 0
            server.stats.handler++

Subscribing to `event_json 'ALL'` is required to e.g. obtain `CHANNEL_EXECUTE_COMPLETE`.

          .then -> @event_json 'ALL'
          .then handler

        catch exception
          report exception

      debug "Ready to start #{pkg.name} #{pkg.version} server."
      return server

Client
======

Client mode is used to place new calls or take over existing calls.

We inherit from the `Socket` class of Node.js' `net` module. This way any method from `Socket` may be re-used (although in most cases only `connect` is used).

    class FreeSwitchClient extends net.Socket
      constructor: ->

Contrarily to the server which will handle multiple socket connections over its lifetime, a client only handles one socket, so only one `FreeSwitchResponse` object is needed as well.

        @call = new FreeSwitchResponse this

Parsing of incoming messages is handled by the connection-listener.

        @on 'connect', =>
          connectionListener @call
        super()

The `client` function we provide wraps `FreeSwitchClient` in order to provide some defaults.
The `handler` will be called in the context of the `FreeSwitchResponse`; the `options` are optional, but may include a `password`.

    exports.default_password = 'ClueCon'

    exports.client = (options = {}, handler, errorHandler) ->
      if typeof options is 'function'
        [options,handler,errorHandler] = [{},options,handler]

If neither `options` not `password` is provided, the default password is assumed.

      options.password ?= exports.default_password

      assert.ok handler?, "client handler is required"
      assert.strictEqual typeof handler, 'function', "client handler must be a function"

      client = new FreeSwitchClient()

Normally when the client connects, FreeSwitch will first send us an authentication request. We use it to trigger the remainder of the stack.

      client.call.once 'freeswitch_auth_request'
      .then ->
        @auth options.password
      .then -> @auto_cleanup()
      .then handler, errorHandler

      debug "Ready to start #{pkg.name} #{pkg.version} client."
      return client

Please note that the client is not started with `event_json` since by default this would mean obtaining all events from FreeSwitch.
You must manually run `@event_json` and an optional `@filter` command.

Toolbox
-------

    assert = require 'assert'
    {error} = require 'util'

    FreeSwitchParser = require './parser'
    FreeSwitchResponse = require './response'
    {parse_header_text} = FreeSwitchParser

    pkg = require '../package.json'
    debug = (require 'debug') 'esl:main'
