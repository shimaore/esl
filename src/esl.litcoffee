Connection Listener (socket events handler)
===========================================

We use the same connection-listener for both client (FreeSwitch "inbound" socket) and server (FreeSwitch "outound" socket).
This is modelled after Node.js' http.js; the connection-listener is called either when FreeSwitch connects to our server, or when we connect to FreeSwitch from our client.

Server
======

Get things started
------------------

The parser will be the one receiving the actual data from the socket. We will process the parser's output below.

The server is used when FreeSwitch needs to be able to initiate a connection to us so that we can handle an existing call.

    import net from 'node:net'

The `server` we export is only slightly more complex. It sets up a filter so that the application only gets its own events, and sets up automatic cleanup which will be used before disconnecting the socket.

The `server` will emit `connection` for every new (incoming) connection, with two arguments:
- the `FreeSwitchResponse` object
- { `headers`, `body`, `data`, `uuid` } retrieved from FreeSWITCH connection.

    import EventEmitter, { once } from 'node:events'

    export class FreeSwitchServer extends EventEmitter

      ###*
      # @params { { all_events?: boolean, my_events?: boolean, logger?: { debug: (msg:string, data?: Object) -> void, info: function, error: function } } options
      ###
      constructor: (options = {}) ->
        super()

        @logger = options.logger ? console
        assert 'function' is typeof @logger.debug
        assert 'function' is typeof @logger.info
        assert 'function' is typeof @logger.error

        all_events = options.all_events ? true
        my_events = options.my_events ? true

        @__server = new net.Server noDelay: true, keepAlive: true

        @stats =
          error: 0n
          drop: 0n
          connection: 0n
          connected: 0n
          connection_error: 0n

        @__server.on 'error', (exception) =>
          @stats.error++
          @logger.error 'FreeSwitchServer: server error', exception
          @emit 'error', exception
          return

        @__server.on 'drop', (data) =>
          @stats.drop++
          @logger.error 'FreeSwitchServer: server drop', data
          @emit 'drop', data
          return

        @__server.on 'connection', (socket) =>
          @stats.connection++
          @logger.debug 'FreeSwitchServer received connection'

Here starts our default request-listener.

          try
            call = new FreeSwitchResponse socket, @logger

            Unique_ID = 'Unique-ID'

Confirm connection with FreeSwitch.

            connect_response = await call.connect()
            data = connect_response.body
            uuid = data[Unique_ID]

            @stats.connected++
            @logger.debug 'FreeSwitchServer received connection: connected', { uuid }
            call.setUUID uuid if uuid?

Restricting events using `filter` is required so that `event_json` will only obtain our events.

            await call.filter Unique_ID, uuid if my_events
            await call.auto_cleanup()
            if all_events
              await call.event_json 'ALL'
            else
              await call.event_json 'CHANNEL_EXECUTE_COMPLETE', 'BACKGROUND_JOB'

            @logger.debug 'FreeSwitchServer received connection: sending `connection` event', { uuid }
            @emit 'connection', call, { ...connect_response, data, uuid }

          catch exception
            @stats.connection_error++
            @logger.error 'FreeSwitchServer: connection handling error', exception
            @emit 'error', exception

          return

        @logger.info 'FreeSwitchServer: Ready to start Event Socket server, use listen() to start.'
        return

      listen: (options) ->
        @__server.listen options
        await once @__server, 'listening'

      close: ->
        @__server.close()
        await once @__server, 'close'

      getConnectionCount: ->
        new Promise (resolve,reject) =>
          @__server.getConnections (err,count) ->
            if err then reject err else resolve count
          return

Client
======

Client mode is used to place new calls or take over existing calls.
Contrarily to the server which will handle multiple socket connections over its lifetime, a client only handles one socket, so only one `FreeSwitchResponse` object is needed as well.

    default_password = 'ClueCon'

    export class FreeSwitchClient extends EventEmitter
      constructor: (options = {}) ->
        super()

        @logger = options.logger ? console
        assert 'function' is typeof @logger.debug
        assert 'function' is typeof @logger.info
        assert 'function' is typeof @logger.error

        @options = {
          host: '127.0.0.1'
          port: 8021
          password: default_password
          ...options
        }

        @current_call = null
        @running = true
        @retry = 200
        @attempt = 0n

        @logger.info 'FreeSwitchClient: Ready to start Event Socket client, use connect() to start.'
        return

      ###*
      # @return undefined
      ###
      connect: () ->
        if not @running
          @logger.debug 'FreeSwitchClient::connect: not running, aborting', { @options, @attempt }
          return

        @attempt++

        @logger.debug 'FreeSwitchClient::connect', { @options, @attempt, @retry }

Destroy any existing socket

        @current_call?.end()

        socket = new net.Socket()
        @current_call = new FreeSwitchResponse socket, @logger

        socket.once 'connect', =>

Normally when the client connects, FreeSwitch will first send us an authentication request. We use it to trigger the remainder of the stack.

          try
            await @current_call?.onceAsync 'freeswitch_auth_request', 20_000, 'FreeSwitchClient expected authentication request'
            await @current_call?.auth @options.password
            await @current_call?.auto_cleanup()
            await @current_call?.event_json 'CHANNEL_EXECUTE_COMPLETE', 'BACKGROUND_JOB'
          catch error
            @logger.error 'FreeSwitchClient: connect error', error
            @emit 'error', error

          if @running and @current_call
            @emit 'connect', @current_call
          return

        socket.once 'error', (error) =>
          code = if 'code' of error then error.code else undefined
          if @retry < 5000
            @retry = (@retry * 1200) // 1000 if code is 'ECONNREFUSED'
          @logger.error 'FreeSwitchClient::connect: client received `error` event', { @attempt, @retry, error, code }
          if @running
            @emit 'reconnecting', @retry
            setTimeout (=> @connect()), @retry
          return

        socket.once 'end', =>
          @logger.debug 'FreeSwitchClient::connect: client received `end` event (remote end sent a FIN packet)', { @attempt, @retry }
          if @running
            @emit 'reconnecting', @retry
            setTimeout (=> @connect()), @retry
          return

        socket.on 'warning', (data) =>
          @emit 'warning', data
          return

        try
          @logger.debug 'FreeSwitchClient::connect: socket.connect', { @options, @attempt, @retry }
          socket.connect @options
        catch error
          @logger.error 'FreeSwitchClient::connect: socket.connect', { error }

        return

      end: ->
        @logger.debug "FreeSwitchClient::end: end requested by application.", { @attempt }
        @emit 'end'
        @running = false
        if @current_call?
          await @current_call.end()
          @current_call = null
        return


Please note that the client is not started with `event_json ALL` since by default this would mean obtaining all events from FreeSwitch. Instead, we only monitor the events we need to be notified for (commands and `bgapi` responses).
You must manually run `event_json` and an optional `filter` command.

Toolbox
-------

    import { FreeSwitchResponse } from './response.litcoffee'
    export { FreeSwitchResponse }
    import assert from 'node:assert'
