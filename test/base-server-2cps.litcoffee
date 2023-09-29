    test = require 'ava'
    FS = require '..'
    EventEmitter = require 'events'

Next test the server at 2 cps call setups per second.

    server = null

    caught = 0
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

    caught = 0

    ev = new EventEmitter

    test.before (t) ->

      PouchDB = require 'pouchdb-core'
        .plugin require 'pouchdb-adapter-memory'
        .defaults adapter: 'memory'
      db = new PouchDB 'routes'

      db.bulkDocs [
        {_id:'route:', comment:'default', target:'324343'}
        {_id:'route:1', comment:'NANPA', target:'37382'}
        {_id:'route:1435', comment:'some state', target:'738829'}
      ]

      service = ->

        destination = @data.variable_sip_req_user

        if destination.match /^lcr7010-\d+$/
          server3.stats.received++
          @once 'freeswitch_disconnect', ->
            server3.stats.completed++

The server builds a list of potential route entries (starting with longest match first)

          dest = destination.match(/^lcr\d+-(\d+)$/)[1]
          ids = ("route:#{dest[0...l]}" for l in [0..dest.length]).reverse()

and these are retrieved from the database.

          {rows} = await db.allDocs keys:ids, include_docs: true

The first successful route is selected.

          doc = (row.doc for row in rows when row.doc?)[0]
          if doc?
            await @command "bridge sip:answer-wait-3000-#{doc.target}@#{domain}"
          else
            t.log "No route for #{dest}"
            await @hangup "500 no route for #{dest}"

          return

        if destination.match /^answer-wait-3000-\d+$/
          await @command 'hangup', "200 destination #{destination}"
          return

        switch destination

          when  'answer-wait-3050'
            await @command 'answer'
            await delay 3050
            await @command 'hangup', '200 answer-wait-3050'

          when 'server7022'
            await @command 'set', 'a=2'
            await @command 'set', 'b=3'
            await @command 'set', 'c=4'
            await @exit()
            ev.emit 'server7022'

          when 'server7004'
            server1.stats.received++

The call is considered completed if FreeSwitch properly notified us it was disconnecting.
This might not mean the call was successful.

            @once 'freeswitch_disconnect', ->
              server1.stats.completed++

            res = await @command 'answer'
            res.body['Channel-Call-State'].should.eql 'ACTIVE'
            server1.stats.answered++
            await delay 3000
            await @hangup '200 server7004'

          when 'server7006'
            server2.stats.received++
            @once 'freeswitch_disconnect', ->
              server2.stats.completed++
            res = await @command 'answer'
            res.body['Channel-Call-State'].should.eql 'ACTIVE'
            server2.stats.answered++

          else
            throw new Error "Invalid destination #{destination}"

      server = FS.server all_events:no, -> service.call(this).catch -> yes
      await new Promise (resolve,reject) ->
        server.on 'listening', -> resolve()
        server.on 'error', reject
        server.listen 7000
        return
      return

    test.after.always (t) ->
      t.timeout 10*second
      await sleep 8*second
      await new Promise (resolve,reject) ->
        server.getConnections (err,count) ->
          if count > 0
            reject new Error "Oops, #{count} active connections leftover"
            return
          server.close ->
            t.log 'server closed'
            resolve()
      setTimeout check, 8*second
      null

    test.skip 'should handle many calls', (t) ->

      count = 20

      t.timeout count/cps*second+7000

      await new Promise (resolve) ->
        caught_client = 0
        sent = 0
        new_call = ->
          client = FS.client ->
            try
              await @api "originate sofia/test-client/sip:server7004@#{domain} &bridge(sofia/test-client/sip:server7006@#{domain})"
              sent += 2
              await delay 500
              client.end()
            catch error
              t.log "Error #{error}"
              caught_client++
              t.log "Caught #{caught_client} client errors."
          .connect client_port, '127.0.0.1'

        for i in [1..count]
          setTimeout new_call, i*second/cps

        done_called = false
        show_stats = ->
          t.log "Sent #{ if show_stats.sent then sent - show_stats.sent else sent}, answered1 #{ if show_stats.answered1 then server1.stats.answered - show_stats.answered1 else server1.stats.answered } completed #{ if show_stats.completed1 then server1.stats.completed - show_stats.completed1 else server1.stats.completed } answered2 #{ if show_stats.answered2 then server2.stats.answered - show_stats.answered2 else server2.stats.answered } completed2 #{ if show_stats.completed2 then server2.stats.completed - show_stats.completed2 else server2.stats.completed } (totals: #{sent}/#{server1.stats.answered}/#{server1.stats.completed}/#{server2.stats.answered}/#{server2.stats.completed})"
          show_stats.sent = sent
          show_stats.answered1 = server1.stats.answered
          show_stats.completed1 = server1.stats.completed
          show_stats.answered2 = server2.stats.answered
          show_stats.completed2 = server2.stats.completed

Success criteria is that we received disconnect notifications from FreeSwitch for all calls.
This might fail for example because FreeSwitch runs out of CPU and starts sending 503 (max-cpu) errors back, meaning the client is unable to send all calls through up to our servers.

          if sent/2 >= count and server1.stats.completed >= count/2 and server2.stats.completed >= count/2
            if not done_called
              done_called = true
              await delay 4000
              resolve()
          return

        for i in [1..6+count/cps]
          setTimeout show_stats, i*second

        return

      t.pass()
      return

Minimal LCR
-----------

    test.skip 'should do LCR', (t) ->

      count = 20

      t.timeout count/cps*second+9000

      await new Promise (resolve) ->
        caught_client = 0
        sent = 0
        new_call = ->
          client = FS.client ->

The client then calls using a predefined number, the call should be routed.
FIXME: extend the test to provide a list of successful and unsuccessful numbers and make sure they are routed / not routed accordingly.
NOTE: This test and many others are done in the [`tough-rate`](https://github.com/shimaore/tough-rate/blob/master/test/call_server.coffee.md#server-unit-under-test) module.

            try
              await @api "originate sofia/test-client/sip:answer-wait-3050@#{domain} &bridge(sofia/test-client/sip:lcr7010-362736237@#{domain})"
              sent += 2
              await delay 500
              client.end()
            catch error
              t.log "Error #{error}"
              caught_client++
              t.log "Caught #{caught_client} client errors."
          .connect client_port, '127.0.0.1'

        for i in [1..count]
          setTimeout new_call, i*second/cps

        show_stats = ->
          t.log "Sent #{sent}, completed #{server3.stats.completed}"
          if sent/2 >= count and server3.stats.completed >= count/2
            if not show_stats.done
              done()
            show_stats.done = true
        for i in [1..2+count/cps]
          setTimeout show_stats, i*second
        return

      t.pass()
      return

Multiple, chained commands
==========================

    test.skip 'should handle chained commands', (t) ->

      t.timeout 2000

      await new Promise (resolve) ->
        ev.on 'server7022', ->
          client.end -> resolve()

        client = FS.client ->
          @event_json 'ALL'
          .then =>
            @api "originate sofia/test-server/sip:server7022@#{domain} &park"
          .catch -> true
        .connect server_port, '127.0.0.1'

        return
      t.pass()
      return

