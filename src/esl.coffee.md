    net = require 'net'
    assert = require 'assert'
    {error} = require 'util'

    FreeSwitchParser = require './parser'
    FreeSwitchResponse = require './response'
    {parse_header_text} = FreeSwitchParser

Connection Listener (socket events handler)
-------------------------------------------

This is modelled after Node.js' http.js
We use the same connection-listener for both client (FreeSwitch "inbound" socket) and server (FreeSwitch "outound" socket).

    connectionListener = (call) ->
      call._trace? 'connectionListener'
      call.stats ?= {}

      call.socket.setEncoding('ascii')
      parser = new FreeSwitchParser call.socket

Make the command responses somewhat unique.

      call.on 'CHANNEL_EXECUTE_COMPLETE', (res) ->
        application = res.body['Application']
        application_data = res.body['Application-Data'] ? ''
        call.emit "CHANNEL_EXECUTE_COMPLETE #{application} #{application_data}", res
        unique_id = res.body['Unique-ID']
        if unique_id?
          call.emit "CHANNEL_EXECUTE_COMPLETE #{unique_id} #{application} #{application_data}", res

      parser.process = (headers,body) ->

Rewrite headers as needed to work around some weirdnesses in the protocol; and assign unified event IDs to the ESL Content-Types.

        content_type = headers['Content-Type']
        if not content_type?
          call.stats.missing_content_type ?= 0
          call.stats.missing_content_type++
          call.socket.emit 'error', {when: 'Missing Content-Type', headers, body}
          return

        switch content_type

          when 'auth/request'
            event = 'freeswitch_auth_request'
            call.stats.auth_request ?= 0
            call.stats.auth_request++

          when 'command/reply'
            event = 'freeswitch_command_reply'
            # Apparently a bug in the response to "connect"
            if headers['Event-Name'] is 'CHANNEL_DATA'
              body = headers
              headers = {}
              for n in ['Content-Type','Reply-Text','Socket-Mode','Control']
                headers[n] = body[n]
                delete body[n]
            call.stats.command_reply ?= 0
            call.stats.command_reply++

          when 'text/event-json'
            try
              body = JSON.parse(body)
            catch exception
              call.stats.json_parse_errors ?= 0
              call.stats.json_parse_errors++
              call.socket.emit 'error', when:'JSON error', error:exception, body:body
              return
            event = body['Event-Name']

          when 'text/event-plain'
            body = parse_header_text(body)
            event = body['Event-Name']
            call.stats.events ?= 0
            call.stats.events++

          when 'log/data'
            event = 'freeswitch_log_data'
            call.stats.log_data ?= 0
            call.stats.log_data++

          when 'text/disconnect-notice'
            event = 'freeswitch_disconnect_notice'
            call.stats.disconnect ?= 0
            call.stats.disconnect++

          when 'api/response'
            event = 'freeswitch_api_response'
            call.stats.api_responses ?= 0
            call.stats.api_responses++

          else
            # FIXME report when:'unhandled Content-Type', content_type:content_type
            event = "freeswitch_#{content_type.replace /[^a-z]/, '_'}"
            call.socket.emit 'error', when:'Unhandled Content-Type', error:content_type
            call.stats.unhandled ?= 0
            call.stats.unhandled++

        msg = {headers,body}

        outcome = call.emit event, msg

      # Get things started
      call.emit 'freeswitch_connect'

ESL Server
----------

    class FreeSwitchServer extends net.Server
      constructor: (requestListener) ->
        @stats = {}
        @on 'connection', (socket) ->
          @stats.connections ?= 0
          @stats.connections++
          call = new FreeSwitchResponse socket
          call.once 'freeswitch_connect'
          .then ->
            try
              requestListener.call call
            catch exception
              call.socket.emit 'error', exception
          connectionListener call

        super()

The callback will receive a FreeSwitchResponse object.

    exports.server = (options = {}, handler, report = error) ->
      if typeof options is 'function'
        [options,handler] = [{},options]

      assert.ok handler?, "server handler is required"
      assert.strictEqual typeof handler, 'function', "server handler must be a function"

      server = new FreeSwitchServer ->
        try
          @trace options.early_trace
          Unique_ID = 'Unique-ID'
          server.stats.connecting ?= 0
          server.stats.connecting++
          @connect()
          .then (res) ->
            @data = res.body
            @uuid = @data[Unique_ID]

`filter` is required so that `event_json` will only obtain our events.

            @filter Unique_ID, @uuid
          .then ->
            @auto_cleanup()
            server.stats.handler ?= 0
            server.stats.handler++

`event_json 'ALL'` is required to e.g. obtain `CHANNEL_EXECUTE_COMPLETE`

          .then -> @event_json 'ALL'
          .then handler

        catch exception
          report exception
      return server

ESL client
----------

    class FreeSwitchClient extends net.Socket
      constructor: ->
        @call = new FreeSwitchResponse this
        @on 'connect', =>
          connectionListener @call
        super()

    exports.client = (options = {}, handler) ->
      if typeof options is 'function'
        [options,handler] = [{},options]
      options.password ?= 'ClueCon'

      assert.ok handler?, "client handler is required"
      assert.strictEqual typeof handler, 'function', "client handler must be a function"

      client = new FreeSwitchClient()
      client.call.trace options.early_trace
      client.call.once 'freeswitch_auth_request'
      .then ->
        @_trace? 'client on auth_request'
        @auth options.password
        .then -> @auto_cleanup()
        .then handler
      return client

Please note that the client is not started with `event_json` since by default this will mean obtaining all events from FreeSwitch.
You must manually run `@event_json` and an optional `@filter` command.
