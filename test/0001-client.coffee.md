    import test from 'ava'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    second = 1000
    sleep = (t) -> new Promise (r) -> setTimeout r, t

Client and server interaction
-----------------------------

These tests are long-runners.

    server = null
    do_show_stats = true
    cps = 2
    client_port = 8024

    test.before (t) ->

      service = (call) ->

        destination = call.data.variable_sip_req_user

        switch destination

          when  'answer-wait-15000'
            await call.command 'answer'
            await delay 15000
            await call.command 'hangup', '200 answer-wait-15000'

          when  'answer-wait-3000'
            await call.command 'answer'
            await delay 3000
            await call.command('hangup', '200 answer-wait-3000').catch -> yes

          else
            t.log "Invalid destination #{destination}"
            throw new Error "Invalid destination #{destination}"

      server = new FreeSwitchServer all_events:no
      server.on 'connection', (call) ->
        try await service call
      await new Promise (resolve) ->
        server.on 'listening', -> resolve()
        server.listen port: 7000
      return

    test.after.always (t) ->
      @timeout 10*second
      await sleep 8*second
      await new Promise (resolve,reject) ->
        server.__server.getConnections (err,count) ->
          if count > 0
            reject new Error "Oops, #{count} active connections leftover"
            return
          await server.close()
          resolve()
      return

    test 'should connect a single call', (t) ->
      t.timeout 17*second

      await new Promise (resolve) ->
        client = new FreeSwitchClient { port: client_port }
        client.on 'connect', (call) ->
          id = uuid.v4()
          options =
            leg_progress_timeout: 1
            leg_timeout: 2
            tracer_uuid: id
          duration = timer()
          call.once 'CHANNEL_HANGUP', (msg) ->
            if msg.body?.variable_tracer_uuid is id
              duration().should.be.above 14*second
              duration().should.be.below 16*second
              client.end()
              resolve()
          await call.event_json 'CHANNEL_HANGUP'
          await call.api "originate [#{options_text options}]sofia/test-client/sip:answer-wait-15000@#{domain} &park"
          return
        client.connect()

      t.pass()
      return

This is a simple test to make sure the client can work with both legs.

    test 'should work with simple routing', (t) ->

      count = 40
      sent = 0

      t.timeout 8000*count/cps

      if do_show_stats
        show_stats = ->
          t.log "Sent #{ if show_stats.sent then sent - show_stats.sent else sent} (totals: #{sent})"
          show_stats.sent = sent
        for i in [1..15]
          setTimeout show_stats, i*second

      await new Promise (resolve) ->
        caught_client = 0
        done_called = false
        new_call = ->
          client = new FreeSwitchClient port: client_port
          client.on 'connect', (call) ->
            try
              await call.api "originate sofia/test-client/sip:answer-wait-3000@#{domain} &bridge(sofia/test-client/sip:answer-wait-3000@#{domain})"
              sent += 2
              await delay 4000
              client.close()
              if sent/2 is count and not done_called
                done_called = true
                await delay 2*3500
                done()
            catch error
              caught_client++
              t.log "Caught #{caught_client} client errors."
          client.connect()
          return

        for i in [1..count]
          setTimeout new_call, i*second/cps

      t.pass()
      return
