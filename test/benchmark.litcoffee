    import test from 'ava'
    import { once } from 'node:events'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    import { start, stop } from './utils.mjs'

    second = 1000
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout

    client_port = 8024
    dialplan_port = 7000
    domain = '127.0.0.1:5062'

    await start()
    await sleep 4*second

    test 'should be reachable', (t) ->
      t.timeout 35*second

      logger =
        debug: ->
        info: (...args) -> console.log ...args
        error: (...args) -> console.error ...args

      client = new FreeSwitchClient port: client_port, logger: logger

      server = new FreeSwitchServer  logger: logger
      await server.listen port: dialplan_port
      received_calls = 0n
      received_completed_calls = 0n
      server.on 'connection', (call) ->
        try
          received_calls++
          await call.command 'ring_ready'
          await call.command 'answer'
          await sleep 7*second
          await call.hangup()
          received_completed_calls++
        catch err
          console.error '------------------ receiving side', err
        return

      runs = 500

      sent_calls = 0n

      client.on 'connect', (service) ->
        console.log '---------------------------- service -----------------'
        running = true
        while --runs and running
          await sleep 10 # 100 cps
          do ->
            try
              await service.bgapi "originate sofia/test-client/sip:test@#{domain} &park"
              sent_calls++
            catch err
              console.error '------ stopped run -----', err
              running = false
            return
        return
      client.connect()

      await sleep 20*second

      await client.end()
      await server.close()

      console.log "-------------- runs: #{runs} sent_calls: #{sent_calls} received_calls: #{received_calls} received_completed_calls: #{received_completed_calls} ---------------"
      if runs is 0
        t.pass()
      else
        t.fail()

      return

    test 'Stop FreeSWITCH', (t) ->
      t.timeout 35*second

Ava runs tests in parallel, so let's wait long enough for the other tests to
complete!

      await sleep 30*second
      await stop()
      t.true yes
