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

    import net from 'node:net'
    import EventEmitter from 'node:events'
    import { FreeSwitchResponse } from './response.litcoffee'
    import assert from 'node:assert'
