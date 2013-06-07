This is modelled after Node.js' `http.js`.

    net         = require 'net'

ESL Server
----------

    exports.Server = class Server extends net.Server
      constructor: (requestListener) ->
        @on 'connection', (socket) ->
          socket.on 'freeswitch_connect', requestListener
          connectionListener socket
        super()

ESL client
----------

    exports.Client = class Client extends net.Socket
      constructor: ->
        @on 'connect', ->
          connectionListener @
        super()

Connection Listener (socket events handler)
-------------------------------------------

A Request is a container for headers and body received from FreeSwitch. It is normally passed as the second argument to a socket event (which would be the opposite of what Node.js' http.js module does) because the Response is used much more often.
An event from the socket will always contain a Response argument (first argument), but might not contain a Request argument (second argument).

    Parser = require './parser'
    Request = require './request'
    Response = require './response'

    connectionListener = (socket) ->

      socket.setEncoding('ascii')
      parser = new Parser socket
      socket.on 'data', (data) ->  parser.on_data(data)
      socket.on 'end',  ()     ->  parser.on_end()

### Make the command responses somewhat unique.

The issue here is that FreeSwitch Event Socket does not offer a proper way to match a `CHANNEL_EXECUTE_COMPLETE` event with the command that started it. A simple UUID in the command submission response would be enough, but it's not provided.
So we have to match on (best we could do) the command and its arguments.

      socket.on 'CHANNEL_EXECUTE_COMPLETE', (res,req) ->
        application = req.body['Application']
        application_data = req.body['Application-Data']
        socket.emit "CHANNEL_EXECUTE_COMPLETE #{application} #{application_data}", res

### Parsed responses handler

      parser.process = (headers,body) ->

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
              socket.emit 'freeswitch_error', error
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

        res = new Response socket
        req = new Request headers,body
        socket.emit event, res, req

      # Trigger the request listener (in server mode).
      socket.emit 'freeswitch_connect', new Response socket
