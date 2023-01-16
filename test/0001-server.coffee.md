    test = require 'ava'
    FS = require '..'
    sleep = (t) -> new Promise (r) -> setTimeout r, t
    second = 1000
    EventEmitter = require 'events'

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

      service = ->

        destination = @data.variable_sip_req_user

        switch destination
          when  'answer-wait-3020'
            await @command 'answer'
            await delay 3000
            await @command 'hangup', '200 answer-wait-3020'

          when 'server7002'
            res = await @command 'answer'
            res.body['Channel-Call-State'].should.eql 'ACTIVE'
            await @command 'hangup', '200 server7002'
            ev.emit 'server7002'

          when 'server7003'
            res = await @command 'answer'
            res.body['Channel-Call-State'].should.eql 'ACTIVE'
            await @command 'hangup', '200 server7003'
            ev.emit 'server7003'

          when 'server7008'
            @once 'cleanup_linger', =>
              ev.emit 'server7008'
              @end()
            await @linger()
            await @command 'answer'
            await delay 1000
            await @command 'hangup', '200 server7008'

          else
            t.log new Error "Invalid destination #{destination}"

        @end()
        return

      server = FS.server all_events: no, -> service.call(this).catch -> yes
      new Promise (resolve,reject) ->
        server.on 'listening', ->
          await sleep 1*second
          resolve()
        server.on 'error', reject
        server.listen 7000
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
            resolve()
      t.pass()
      return

    test 'should handle one call', (t) ->
      t.timeout 5000
      await new Promise (resolve,reject) ->

        ev.on 'server7002', ->
          client.end()
          await delay 3500
          resolve()
          return

        client = FS.client ->
          @api "originate sofia/test-client/sip:server7002@#{domain} &bridge(sofia/test-client/sip:answer-wait-3020@#{domain})"
          .catch (error) ->
            reject error
        client.connect client_port, '127.0.0.1'
        null

      t.pass()
      return

    test 'should handle one call (bgapi)', (t) ->
      t.timeout 4000
      await new Promise (resolve,reject) ->

        ev.on 'server7003', ->
          client.end()
          await delay 3500
          resolve()

        client = FS.client ->
          @bgapi "originate sofia/test-client/sip:server7003@#{domain} &bridge(sofia/test-client/sip:answer-wait-3020@#{domain})"
          .catch (error) ->
            reject error
        client.connect client_port, '127.0.0.1'
        null

      t.pass()
      return

The `exit` command normally triggers automatic cleanup for linger
-----------------------------------------------------------------

Automatic cleanup should trigger a `cleanup_linger` event if we're using linger mode.

    test 'should linger on exit', (t) ->
      t.timeout 4000
      await new Promise (resolve,reject) ->

        ev.on 'server7008', ->
          client.end ->
            await delay 3500
            resolve()

        client = FS.client ->
          @api "originate sofia/test-client/sip:server7008@#{domain} &hangup"
          .catch reject
        client.connect client_port, '127.0.0.1'
        null

      t.pass()
      return
