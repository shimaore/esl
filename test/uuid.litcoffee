    import test from 'ava'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    import { once } from 'node:events'
    import { start_server, stop } from './utils.mjs'

    second = 1000
    sleep = (t) -> new Promise (resolve) -> setTimeout resolve, t; return

Using UUID (in client mode)
---------------------------

    test.before ->
      await start_server()
      await sleep 2*second
      return

    server_port = 8022
    domain = '127.0.0.1:5062'

    service = (call, { data }) ->
      destination = data.variable_sip_req_user

      console.log 'Service started', { destination }

      switch destination

        when 'answer-wait-30000'
          console.log 'Service answer'
          await call.command 'answer'
          console.log 'Service wait 30s'
          await sleep 30*second

        else
          console.error "Invalid destination #{destination}"

      console.log 'Service hanging up'
      await call.hangup()
      console.log 'Service hung up'
      return

    server = new FreeSwitchServer all_events:yes, my_events:false
    server.on 'connection', service
    server.on 'error', (error) -> console.log 'Service', error
    await server.listen port: 7000

    console.log 'Waiting for FS to stabilize'
    await sleep 2*second

    test 'should handle UUID-based commands', (t) ->

      t.timeout 20000

      client = new FreeSwitchClient port: server_port
      client.connect()
      [call] = await once client, 'connect'
      call_uuid = null
      await call.event_json 'ALL'
      origination_uuid = '1829'
      res = await call.api "originate {origination_uuid=#{origination_uuid},origination_channel_name='1234'}sofia/test-server/sip:answer-wait-30000@#{domain} &park"
      t.true 'uuid' of res
      call_uuid = res.uuid
      t.is call_uuid, origination_uuid
      await sleep 1000
      res = await call.command_uuid call_uuid, 'hangup'
      t.true 'body' of res
      t.true 'Hangup-Cause' of res.body
      t.is res.body['Hangup-Cause'], 'NORMAL_CLEARING'
      await client.end()
      return

    test 'should map sequential responses', (t) ->
      client = new FreeSwitchClient port: server_port
      client.connect()
      [call] = await once client, 'connect'
      uuid_1 = null
      uuid_2 = null
      res = await call.api "create_uuid"
      uuid_1 = res.body
      res = await call.api "create_uuid"
      uuid_2 = res.body
      client.end()
      t.not uuid_1, uuid_2, "UUIDs should be unique"
      return

    test 'should map sequential responses (using bgapi)', (t) ->
      client = new FreeSwitchClient port: server_port
      client.connect()
      [call] = await once client, 'connect'
      uuid_1 = null
      uuid_2 = null
      res = await call.bgapi "create_uuid"
      uuid_1 = res.body
      res = await call.bgapi "create_uuid"
      uuid_2 = res.body
      client.end()
      t.not uuid_1, uuid_2, "UUIDs should be unique"
      return

    test 'should map sequential responses (sent in parallel)', (t) ->
      client = new FreeSwitchClient port: server_port
      client.connect()
      [call] = await once client, 'connect'
      uuid_1 = null
      uuid_2 = null
      p1 = call.api "create_uuid"
        .then (res) ->
          uuid_1 = res.body

      p2 = call.api "create_uuid"
        .then (res) ->
          uuid_2 = res.body

      await Promise.all [p1,p2]
      client.end()
      t.true uuid_1?, 'Not sequential'
      t.true uuid_2?, 'Not sequential'
      t.not uuid_1, uuid_2, "UUIDs should be unique"
      return

    test 'should work with parallel responses (using api)', (t) ->
      client = new FreeSwitchClient port: server_port
      client.connect()
      [call] = await once client, 'connect'
      uuid_1 = null
      uuid_2 = null
      p1 = call.api "create_uuid"
        .then (res) ->
          uuid_1 = res.body
      p2 = call.api "create_uuid"
        .then (res) ->
          uuid_2 = res.body
      await Promise.all [p1,p2]
      client.end()
      t.true uuid_1?, 'Not sequential'
      t.true uuid_2?, 'Not sequential'
      t.not uuid_1, uuid_2, "UUIDs should be unique"
      return

    test 'should work with parallel responses (using bgapi)', (t) ->
      client = new FreeSwitchClient port: server_port
      client.connect()
      [call] = await once client, 'connect'
      uuid_1 = null
      uuid_2 = null
      p1 = call.bgapi "create_uuid"
        .then (res) ->
          t.log 'uuid_1', res
          uuid_1 = res.body
      p2 = call.bgapi "create_uuid"
        .then (res) ->
          t.log 'uuid_2', res
          uuid_2 = res.body
      await Promise.all [p1,p2]
      client.end()
      t.true uuid_1?, 'Not sequential'
      t.true uuid_2?, 'Not sequential'
      t.not uuid_1, uuid_2, "UUIDs should be unique"
      return

    test 'should handle errors', (t) ->
      t.timeout 2000

      client = new FreeSwitchClient port: server_port
      client.connect()
      [call] = await once client, 'connect'
      await call.event_json 'ALL'
      res = await call.api "originate sofia/test-server/sip:answer-wait-30000@#{domain} &park"
      t.true 'uuid' of res
      call_uuid = res.uuid
      ref = process.hrtime.bigint()
      p = do =>  # parallel
        res = await call.command_uuid call_uuid, 'play_and_get_digits', '4 5 3 20000 # silence_stream://4000 silence_stream://4000 choice \\d 1000', 4200
        now = process.hrtime.bigint()
        duration = now - ref
        t.true duration > 1000000000n
        t.true duration < 1200000000n
        t.like res,
          body:
            'Answer-State': 'hangup'
            'Hangup-Cause': 'NO_PICKUP'
        return
      await sleep 1000
      await call.hangup_uuid call_uuid, 'NO_PICKUP'
      await sleep 500
      client.end()
      await p
      return

Test DTMF
---------

This test should work but I haven't taken the time to finalize it.

    test.skip 'should detect DTMF', (t) ->
      t.timeout 9000
      server = new FreeSwitchServer all_events:no
      server.on 'connection', (call) ->

        await call.event_json 'DTMF'
        await call.api 'sofia global siptrace on'
        await call.command "answer"
        await call.command "start_dtmf"
        t.log 'answered'
        await call.command 'sleep', 10000
        await sleep 10000
        await call.exit
        return

      server.listen 7012

      client = new FreeSwitchClient port: server_port
      client.on 'connect', (call) ->
        call.trace on
        channel_uuid = null
        core_uuid = null
        call.on 'CHANNEL_OUTGOING', (msg) ->
          core_uuid = msg.body['Unique-ID']
          t.log 'CHANNEL_OUTGOING', {core_uuid}

        await call.event_json 'ALL'
        await call.api 'sofia status'
        await call.api 'sofia global siptrace on'
        msg = await call.api "originate sofia/test-server/sip:server7012@#{domain} &park"
        channel_uuid = (msg.body.match /\+OK ([\da-f-]+)/)?[1]
        t.log 'originate', {channel_uuid}
        await sleep 2000
        msg = await call.api "uuid_send_dtmf #{channel_uuid} 1234"
        t.log 'api', msg
        await sleep 5000
      client.connect()
      return

    test 'server cleans up properly', (t) ->
      t.timeout 10*second
      await sleep 7*second
      count = await server.getConnectionCount()
      t.is count, 0, "Oops, #{count} active connections leftover"
      await server.close()
      t.log 'server closed'

    test.after 'Stop FreeSWITCH', (t) ->
      t.timeout 5*second
      await sleep 2*second
      await stop()
      await sleep 2*second
