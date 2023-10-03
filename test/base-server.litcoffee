    import test from 'ava'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    import { start, stop } from './utils.mjs'
    import { once, EventEmitter } from 'node:events'
    import { second, sleep } from './tools.mjs'

    domain = '127.0.0.1:5062'

    logger = (t) ->
      # debug: (...args) -> t.log 'debug', ...args
      debug: ->
      info: (...args) -> t.log 'info', ...args
      error: (...args) -> t.log 'error', ...args


Tests of the `server` part
==========================

Server startup and connectivity
-------------------------------

This is really a basic test to make sure the infrastructure is running.

    server = null
    client_port = 8024

We start one server

    ev = new EventEmitter

    test.before (t) ->

      service = (call, {data}) ->

        destination = data.variable_sip_req_user

        switch destination
          when  'answer-wait-3020'
            await call.command 'answer'
            await sleep 3000
            await call.command 'hangup', '200 answer-wait-3020'

          when 'server7002'
            res = await call.command 'answer'
            t.is res.body['Channel-Call-State'], 'ACTIVE'
            await call.command 'hangup', '200 server7002'
            ev.emit 'server7002'

          when 'server7003'
            res = await call.command 'answer'
            t.is res.body['Channel-Call-State'], 'ACTIVE'
            await call.command 'hangup', '200 server7003'
            ev.emit 'server7003'

          when 'server7008'
            call.once 'cleanup_linger', =>
              ev.emit 'server7008'
              call.end()
            await call.linger()
            await call.command 'answer'
            await sleep 1000
            await call.command 'hangup', '200 server7008'

          else
            t.log new Error "Invalid destination #{destination}"

        call.end()
        return

      server = new FreeSwitchServer all_events:no
      server.on 'connection', (call,args) ->
        t.log 'Server-side', call, args
        try
          await service call, args
        catch err
          t.log 'Server-side error', err
        return

      server.listen port: 7000
      await sleep 1*second
      return

    test.after.always (t) ->
      t.timeout 10*second
      await sleep 8*second
      count = await server.getConnectionCount()
      if count > 0
        throw new Error "Oops, #{count} active connections leftover"
      await server.close()
      t.pass()
      return

    test.before (t) ->
      t.timeout 5*second
      await start()
      await sleep 4*second

    test.after (t) ->
      t.timeout 5*second
      await sleep 4*second
      await stop()

    test 'should handle one call', (t) ->
      t.timeout 5*second

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      ev.on 'server7002', ->
        client.end()
        t.pass()
        return

      await service.api "originate sofia/test-client/sip:server7002@#{domain} &bridge(sofia/test-client/sip:answer-wait-3020@#{domain})"
      await sleep 3500
      return

    test 'should handle one call (bgapi)', (t) ->
      t.timeout 4*second

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      ev.on 'server7003', ->
        client.end()
        t.pass()
        return

      await service.bgapi "originate sofia/test-client/sip:server7003@#{domain} &bridge(sofia/test-client/sip:answer-wait-3020@#{domain})"
      await sleep 3500
      return

The `exit` command normally triggers automatic cleanup for linger
-----------------------------------------------------------------

Automatic cleanup should trigger a `cleanup_linger` event if we're using linger mode.

    test 'should linger on exit', (t) ->
      t.timeout 4*second

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      ev.on 'server7008', ->
        client.end ->
        t.pass()
        return

      await service.api "originate sofia/test-client/sip:server7008@#{domain} &hangup"
      await sleep 3500
      return
