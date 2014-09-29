    net = require 'net'
    assert = require 'assert'

    FreeSwitchParser = require './parser'
    FreeSwitchResponse = require './response'

Connection Listener (socket events handler)
-------------------------------------------

This is modelled after Node.js' http.js

    connectionListener = (call) ->
      call.stats ?= {}

      call.socket.setEncoding('ascii')
      parser = new FreeSwitchParser call.socket
      # call.socket.on 'data', (data) ->  parser.on_data(data)
      # call.socket.on 'end',  ()     ->  parser.on_end()

Make the command responses somewhat unique.

      call.socket.on 'CHANNEL_EXECUTE_COMPLETE', (call) ->
        application = call.body['Application']
        application_data = call.body['Application-Data'] ? ''
        call.socket.emit "CHANNEL_EXECUTE_COMPLETE #{application} #{application_data}", call

      parser.process = (headers,body) ->

Rewrite headers as needed to work around some weirdnesses in the protocol; and assign unified event IDs to the ESL Content-Types.

        content_type = headers['Content-Type']
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
            catch error
              call.stats.json_parse_errors ?= 0
              call.stats.json_parse_errors++
              call.socket.emit 'error', when:'JSON error', error:error, body:body
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

        call.headers = headers
        call.body = body

        call.socket.emit event, call

      # Get things started
      call.socket.emit 'freeswitch_connect', call

ESL Server
----------

    class FreeSwitchServer extends net.Server
      constructor: (requestListener) ->
        @stats = {}
        @on 'connection', (socket) ->
          @stats.connections ?= 0
          @stats.connections++
          socket.on 'freeswitch_connect', (call) ->
            try
              requestListener call
            catch error
              socket.emit 'error', error
          connectionListener new FreeSwitchResponse socket

        super()

The callback will receive a FreeSwitchResponse object.

    exports.server = (handler) ->
      assert.ok handler?, "server handler is required"

      server = new FreeSwitchServer (call) ->
        Unique_ID = 'Unique-ID'
        server.stats.connecting ?= 0
        server.stats.connecting++
        call.connect()
        .then ->
          @data = @body
          unique_id = @body[Unique_ID]
          @filter Unique_ID, unique_id
        .then ->
          @auto_cleanup()
          # "verbose_events" will send us channel data after each "command".
          @command 'verbose_events' # FIXME why can't we return the value of @command ?
          null
        .then -> @event_json 'ALL'
        .then ->
          server.stats.handler ?= 0
          server.stats.handler++
          this
        .then handler
      return server

ESL client
----------

    class FreeSwitchClient extends net.Socket
      constructor: () ->
        @on 'connect', ->
          connectionListener new FreeSwitchResponse this

        super()

    exports.client = (options = {}, handler) ->
      if typeof options is 'function'
        [options,handler] = [{},options]
      options.password ?= 'ClueCon'

      assert.ok handler?, "client handler is required"

      client = new FreeSwitchClient()
      client.once 'freeswitch_auth_request', (call) ->
        call.auth options.password
        .then -> @auto_cleanup()
        .then handler
      return client
