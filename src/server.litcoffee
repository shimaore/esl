Connection Listener (socket events handler)
===========================================

We use the same connection-listener for both client (FreeSwitch "inbound" socket) and server (FreeSwitch "outound" socket).
This is modelled after Node.js' http.js; the connection-listener is called either when FreeSwitch connects to our server, or when we connect to FreeSwitch from our client.

Server
======

The server is used when FreeSwitch needs to be able to initiate a connection to
Node.js so that our code can handle an existing call.

The parser will be the one receiving the actual data from the socket. We will process the parser's output below.
The `server` we export is only slightly more complex. It sets up a filter so that the application only gets its own events, and sets up automatic cleanup which will be used before disconnecting the socket.

The `server` will emit `connection` for every new (incoming) connection, with two arguments:
- the `FreeSwitchResponse` object
- { `headers`, `body`, `data`, `uuid` } retrieved from FreeSWITCH connection.

    export class FreeSwitchServer extends EventEmitter

      ###*
      # @param { { all_events?: boolean, my_events?: boolean, logger?: { debug: (msg:string, data?: unknown) => void, info: (msg:string, data?: unknown) => void, error: (msg:string, data?: unknown) => void } } | undefined } options
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
Toolbox
-------

    import net from 'node:net'
    import EventEmitter, { once } from 'node:events'
    import { FreeSwitchResponse } from './response.litcoffee'
    import assert from 'node:assert'
