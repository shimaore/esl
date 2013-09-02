    net         = require 'net'

    exports.debug = true

    if exports.debug
      util = require 'util'
      debug = (o) ->
        util.log util.inspect o

    FreeSwitchParser = require './parser'
    FreeSwitchResponse = require './response'

Connection Listener (socket events handler)
-------------------------------------------

This is modelled after Node.js' http.js

    connectionListener = (call) ->

      call.socket.setEncoding('ascii')
      parser = new FreeSwitchParser call.socket
      call.socket.on 'data', (data) ->  parser.on_data(data)
      call.socket.on 'end',  ()     ->  parser.on_end()

Make the command responses somewhat unique.

      call.socket.on 'CHANNEL_EXECUTE_COMPLETE', (call) ->
        application = call.body['Application']
        application_data = call.body['Application-Data']
        call.socket.emit "CHANNEL_EXECUTE_COMPLETE #{application} #{application_data}", call

      parser.process = (headers,body) ->
        debug? {headers,body}

Rewrite headers as needed to work around some weirdnesses in the protocol; and assign unified event IDs to the ESL Content-Types.

        switch headers['Content-Type']

          when 'auth/request'
            event = 'freeswitch_auth_request'

          when 'command/reply'
            event = 'freeswitch_command_reply'
            # Apparently a bug in the response to "connect"
            if headers['Event-Name'] is 'CHANNEL_DATA'
              body = headers
              headers = {}
              for n in ['Content-Type','Reply-Text','Socket-Mode','Control']
                headers[n] = body[n]
                delete body[n]

          when 'text/event-json'
            try
              body = JSON.parse(body)
            catch error
              debug? "JSON #{error} in #{body}"
              return
            event = body['Event-Name']

          when 'text/event-plain'
            body = parse_header_text(body)
            event = body['Event-Name']

          when 'log/data'
            event = 'freeswitch_log_data'

          when 'text/disconnect-notice'
            event = 'freeswitch_disconnect_notice'

          when 'api/response'
            event = 'freeswitch_api_response'

          else
            event = headers['Content-Type']

        call.headers = headers
        call.body = body

        debug? when:'connection listener socket.emit', event:event, call:call
        call.socket.emit event, call

      # Get things started
      debug? when:'connection listener emit freeswitch_connect', call:call
      call.socket.emit 'freeswitch_connect', call

ESL Server
----------

    class FreeSwitchServer extends net.Server
      constructor: (requestListener) ->
        @on 'connection', (socket) ->
          socket.on 'freeswitch_connect', requestListener
          connectionListener new FreeSwitchResponse socket

        super()

The callback will receive a FreeSwitchResponse object.

    exports.server = (handler) ->
      server = new FreeSwitchServer (call) ->
        Unique_ID = 'Unique-ID'
        call.sequence [
          ->
            @connect()
          ->
            # "verbose_events" will send us channel data after each "command".
            @command 'verbose_events'
            @auto_cleanup()
          ->
            unique_id = @body[Unique_ID]
            @filter Unique_ID, unique_id
          ->
              @event_json 'ALL'
          ->
            handler? @
        ]
      return server

ESL client
----------

    class FreeSwitchClient extends net.Socket
      constructor: () ->
        @on 'connect', ->
          connectionListener new FreeSwitchResponse @

        super()

    exports.client = (options = {}, handler) ->
      if typeof options is 'function'
        [options,handler] = [{},options]
      options.password ?= 'ClueCon'
      if not handler?
        throw new Error "handler is required"
      client = new FreeSwitchClient()
      client.once 'freeswitch_auth_request', (call) ->
        debug? when: "Challenged for authentication"
        call.auth(options.password).then (call) ->
          call.auto_cleanup()
          debug? when:"Authentication sent", call:call
          handler? call
      return client
