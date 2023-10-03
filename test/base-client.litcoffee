    import test from 'ava'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    import { start, stop } from './utils.mjs'
    import { once } from 'node:events'
    import { v4 as uuidv4 } from 'uuid'
    import { second, sleep, timer } from './tools.mjs'

    domain = '127.0.0.1:5062'

    options_text = (options) -> ("#{key}=#{value}" for key, value of options).join ','

    logger = (t) ->
      debug: ->
      info: (...args) -> t.log 'info', ...args
      error: (...args) -> t.log 'error', ...args

Client and server interaction
-----------------------------

These tests are long-runners.

    server = null
    cps = 2
    client_port = 8024

    test.before (t) ->
      t.timeout 5*second
      await start()
      await sleep 4*second
      return

    test.after (t) ->
      t.timeout 3*second
      await sleep 2*second
      await stop()
      return

    test.before (t) ->

      service = (call, {data}) ->

        destination = data.variable_sip_req_user

        switch destination

          when  'answer-wait-15000'
            await call.command 'answer'
            await sleep 15*second
            await call.command 'hangup', '200 answer-wait-15000'

          when  'wait-15000-answer'
            await sleep 15*second
            await call.command 'answer'
            await sleep 1*second
            await call.command 'hangup', '200 answer-wait-15000'

          when  'answer-wait-3000'
            await call.command 'answer'
            await sleep 3*second
            await call.command('hangup', '200 answer-wait-3000').catch -> yes

          else
            t.log "Invalid destination #{destination}"
            throw new Error "Invalid destination #{destination}"

        return

      server = new FreeSwitchServer all_events:no
      server.on 'connection', (call,args) ->
        t.log 'Server-side', call, args
        try
          await service call, args
        catch err
          t.log 'Server-side error', err
        return
      await server.listen port: 7000
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

    test 'should detect leg_progress_timeout', (t) ->
      t.timeout 4*second

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        leg_progress_timeout: 1
        tracer_uuid: id

      try
        t.log id
        await service.api "originate [#{options_text options}]sofia/test-client/sip:wait-15000-answer@#{domain} &park"
      catch err
        # @ts-expect-error
        t.is err.args.reply, '-ERR PROGRESS_TIMEOUT\n'

      await client.end()
      return

    test 'should detect leg_timeout', (t) ->
      t.timeout 4*second

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        leg_timeout: 2
        tracer_uuid: id

      try
        t.log id
        await service.api "originate [#{options_text options}]sofia/test-client/sip:wait-15000-answer@#{domain} &park"
      catch err
        # @ts-expect-error
        t.is err.args.reply, '-ERR ALLOTTED_TIMEOUT\n'

      await client.end()
      return

    test 'should detect hangup', (t) ->
      t.timeout 18*second

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        tracer_uuid: id

      duration = timer()
      service.on 'CHANNEL_HANGUP', (msg) ->
        if msg.body?.variable_tracer_uuid is id
          d = duration()
          t.true d > 14*second
          t.true d < 16*second
        return

      await service.event_json 'CHANNEL_HANGUP'
      await service.api "originate [#{options_text options}]sofia/test-client/sip:answer-wait-15000@#{domain} &park"

      await sleep 16*second

      await client.end()
      return

This is a simple test to make sure the client can work with both legs.

    test 'should work with simple routing', (t) ->

      count = 40
      sent = 0

      t.timeout 4000*count/cps

      caught_client = 0
      new_call = ->
        client = new FreeSwitchClient port: client_port, logger: logger t
        client.on 'connect', (call) ->
          try
            await call.api "originate sofia/test-client/sip:answer-wait-3000@#{domain} &bridge(sofia/test-client/sip:answer-wait-3000@#{domain})"
            sent += 2
            await sleep 4000
            client.end()
          catch error
            t.fail()
            caught_client++
            t.log "Caught #{caught_client} client errors.", error
        client.connect()
        return

      for i in [1..count]
        setTimeout new_call, i*second/cps

      await sleep 4000*count/cps-500
      t.true sent/2 is count

      return
