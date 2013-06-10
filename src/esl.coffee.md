    net         = require 'net'

    exports.debug = false

    if exports.debug
      util = require 'util'
      debug = (o) ->
        util.log util.inspect o

    eslParser = require './parser'
    eslResponse = require './response'

Connection Listener (socket events handler)
-------------------------------------------

This is modelled after Node.js' http.js

    connectionListener = (socket) ->

      socket.setEncoding('ascii')
      parser = new eslParser socket
      socket.on 'data', (data) ->  parser.on_data(data)
      socket.on 'end',  ()     ->  parser.on_end()

Make the command responses somewhat unique.

      socket.on 'CHANNEL_EXECUTE_COMPLETE', (res) ->
        application = res.body['Application']
        application_data = res.body['Application-Data']
        socket.emit "CHANNEL_EXECUTE_COMPLETE #{application} #{application_data}", res

      parser.process = (headers,body) ->
        if exports.debug
          util.log util.inspect headers: headers, body: body

Rewrite headers as needed to work around some weirdnesses in the protocol; and assign unified event IDs to the ESL Content-Types.

        switch headers['Content-Type']

          when 'auth/request'
            event = 'esl_auth_request'

          when 'command/reply'
            event = 'esl_command_reply'
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
              util.log "JSON #{error} in #{body}"
              return
            event = body['Event-Name']

          when 'text/event-plain'
            body = parse_header_text(body)
            event = body['Event-Name']

          when 'log/data'
            event = 'esl_log_data'

          when 'text/disconnect-notice'
            event = 'esl_disconnect_notice'

          when 'api/response'
            event = 'esl_api_response'

          else
            event = headers['Content-Type']

        res = new eslResponse socket,headers,body
        if exports.debug
          util.log util.inspect event:event, res:res
        socket.emit event, res

      # Get things started
      socket.emit 'esl_connect', new eslResponse socket

ESL Server
----------

    class eslServer extends net.Server
      constructor: (requestListener) ->
        @on 'connection', (socket) ->
          socket.on 'esl_connect', requestListener
          connectionListener socket

        super()

The callback will receive an eslResponse object.

    exports.createCallServer = ->
      server = new eslServer (call) ->
        Unique_ID = 'Unique-ID'
        call.connect (call) ->
          unique_id = call.body[Unique_ID]
          call.auto_cleanup()
          call.filter Unique_ID, unique_id, ->
            call.event_json 'ALL', ->
              server.emit 'CONNECT', call
      return server

ESL client
----------

    class eslClient extends net.Socket
      constructor: () ->
        @on 'connect', ->
          connectionListener @

        super()

    exports.createClient = -> return new eslClient()
