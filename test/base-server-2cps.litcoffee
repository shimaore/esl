    import test from 'ava'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    import { start, stop } from './utils.mjs'
    import { once, EventEmitter } from 'node:events'

    import PouchDB from 'pouchdb-core'
    import PouchDBAdapterMemory from 'pouchdb-adapter-memory'

    import { second, sleep } from './tools.mjs'

    domain = '127.0.0.1:5062'

    logger = (t) ->
      # debug: (...args) -> t.log 'debug', ...args
      debug: ->
      info: (...args) -> t.log 'info', ...args
      error: (...args) -> t.log 'error', ...args


Next test the server at 2 cps call setups per second.

    server = null
    client_port = 8024
    cps = 2

    server3 = stats:
      received: 0
      answered: 0
      completed: 0
    server1 = stats:
      received: 0
      answered: 0
      completed: 0
    server2 = stats:
      received: 0
      answered: 0
      completed: 0
    db = null

We implement a small LCR database using PouchDB.

    ev = new EventEmitter

    test.before (t) ->

      DB = PouchDB
        .plugin PouchDBAdapterMemory
        .defaults adapter: 'memory'
      db = new DB 'routes'

      db.bulkDocs [
        {_id:'route:', comment:'default', target:'324343'}
        {_id:'route:1', comment:'NANPA', target:'37382'}
        {_id:'route:1435', comment:'some state', target:'738829'}
      ]

      service = (call, {data}) ->

        destination = data.variable_sip_req_user

        if destination.match /^lcr7010-\d+$/
          server3.stats.received++
          call.once 'freeswitch_disconnect', ->
            server3.stats.completed++

The server builds a list of potential route entries (starting with longest match first)

          dest = destination.match(/^lcr\d+-(\d+)$/)[1]
          ids = ("route:#{dest[0...l]}" for l in [0..dest.length]).reverse()

and these are retrieved from the database.

          {rows} = await db.allDocs keys:ids, include_docs: true

The first successful route is selected.

          doc = (row.doc for row in rows when row.doc?)[0]
          if doc?
            await call.command "bridge sip:answer-wait-3000-#{doc.target}@#{domain}"
          else
            t.log "No route for #{dest}"
            await call.hangup "500 no route for #{dest}"

          return

        if destination.match /^answer-wait-3000-\d+$/
          await call.command 'hangup', "200 destination #{destination}"
          return

        switch destination

          when  'answer-wait-3050'
            await call.command 'answer'
            await sleep 3050
            await call.command 'hangup', '200 answer-wait-3050'

          when 'server7022'
            t.log 'Received server7022'
            await call.command 'set', 'a=2'
            await call.command 'set', 'b=3'
            await call.command 'set', 'c=4'
            t.log 'Received server7022: calling exit'
            await call.exit()
            t.log 'Received server7022: sending event'
            ev.emit 'server7022'

          when 'server7004'
            server1.stats.received++

The call is considered completed if FreeSwitch properly notified us it was disconnecting.
This might not mean the call was successful.

            call.once 'freeswitch_disconnect', ->
              server1.stats.completed++

            res = await call.command 'answer'
            t.is res.body['Channel-Call-State'], 'ACTIVE'
            server1.stats.answered++
            await sleep 3000
            await call.hangup '200 server7004'

          when 'server7006'
            server2.stats.received++
            call.once 'freeswitch_disconnect', ->
              server2.stats.completed++
            res = await call.command 'answer'
            t.is res.body['Channel-Call-State'], 'ACTIVE'
            server2.stats.answered++

          else
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

    test 'should handle many calls', (t) ->

      count = 20

      t.timeout count/cps*second+7000

      sent = 0
      new_call = ->
        client = new FreeSwitchClient port: client_port, logger: logger t

        p = once client, 'connect'
        client.connect()
        [ service ] = await p

        await service.api "originate sofia/test-client/sip:server7004@#{domain} &bridge(sofia/test-client/sip:server7006@#{domain})"
        sent += 1
        client.end()
        return

      for i in [1..count]
        setTimeout new_call, i*second/cps

Success criteria is that we received disconnect notifications from FreeSwitch for all calls.
This might fail for example because FreeSwitch runs out of CPU and starts sending 503 (max-cpu) errors back, meaning the client is unable to send all calls through up to our servers.

      await sleep count/cps*second+6000
      t.log "sent=#{sent} count=#{count} server1.stats.completed=#{server1.stats.completed} server2.stats.completed=#{server2.stats.completed}"
      t.true sent is count and server1.stats.completed is count and server2.stats.completed is count

      return

Minimal LCR
-----------

    test 'should do LCR', (t) ->

      count = 20

      t.timeout count/cps*second+9000

      sent = 0
      new_call = ->
        client = new FreeSwitchClient port: client_port, logger: logger t

        p = once client, 'connect'
        client.connect()
        [ service ] = await p

The client then calls using a predefined number, the call should be routed.
FIXME: extend the test to provide a list of successful and unsuccessful numbers and make sure they are routed / not routed accordingly.
NOTE: This test and many others are done in the [`tough-rate`](https://github.com/shimaore/tough-rate/blob/master/test/call_server.coffee.md#server-unit-under-test) module.

        await service.api "originate sofia/test-client/sip:answer-wait-3050@#{domain} &bridge(sofia/test-client/sip:lcr7010-362736237@#{domain})"
        sent += 1
        client.end()
        return

      for i in [1..count]
        setTimeout new_call, i*second/cps

      await sleep count/cps*second+8000
      t.log "sent=#{sent} count=#{count} server1.stats.completed=#{server1.stats.completed} server2.stats.completed=#{server2.stats.completed}"
      t.true sent is count and server3.stats.completed is count

      return

Multiple, chained commands
==========================

    test 'should handle chained commands', (t) ->

      t.timeout 2000

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      q = once ev, 'server7022'

      await service.event_json 'ALL'
      try
        await service.api "originate sofia/test-client/sip:server7022@#{domain} &park"
      catch err
        # @ts-expect-error
        t.is err.res.body, '-ERR NORMAL_CLEARING\n'
      await q
      t.pass()
      client.end()
      return
