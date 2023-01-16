    test = require 'ava'
    require 'should'
    FS = require '..'
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout
    uuid = require 'uuid'
    EventEmitter = require 'events'

We start two FreeSwitch docker.io instances, one is used as the "client" (and is basically our SIP test runner), while the other one is the "server" (and is used to test the `server` side of the package).

    client_port = 8024
    server_port = 8022

FreeSwitch SIP domain.

    domain = '127.0.0.1:5062'

On my laptop I can only get up to 14 cps with the two FreeSwitch instances running. Will need to characterise what is sustainable on travis-ci.

    cps = 2
    second = 1000

    do_show_stats = false

`leg_progress_timeout` counts from the time the INVITE is placed until a progress indication (e.g. 180, 183) is received. Controls Post-Dial-Delay on this leg.

leg_timeout restrict the length of ringback, à la bridge_answer_timeout


FIXME: conversion in general terms is more complex, value may contain comma, quote, etc.

    options_text = (options) -> ("#{key}=#{value}" for key, value of options).join ','

    timer = ->
      now = new Date()
      ->
        new Date() - now

This flag is used to hide extraneous messages (esp. benchmark data) during regular tests.

Test for error conditions
=========================

The goal is to document how to detect error conditions, especially wrt LCR conditions.

    server = null

    ev = new EventEmitter

    test.before ->

      service = ->

        destination = @data.variable_sip_req_user

        switch
          when destination is 'answer-wait-3010'
            await @command 'answer'
            await sleep 3010

          when destination is 'wait-24000-ring-ready'
            await sleep 24000
            await @command('ring_ready').catch -> true
            await sleep 9999

          when m = destination.match /^wait-(\d+)-respond-(\d+)$/
            await sleep parseInt m[1]
            await @command 'respond', m[2]
            await sleep 9999

          when destination is 'foobared'
            await @command 'respond', 485

          else
            await @command 'respond', 400

      server = FS.server all_events:no, -> service.call(this).catch -> yes
      await new Promise (resolve,reject) ->
        server.on 'listening', -> resolve()
        server.on 'error', reject
        server.listen 7000
      return

    test.after (t) ->
      t.timeout 10*second
      await sleep 8*second
      await new Promise (resolve,reject) ->
        server.getConnections (err,count) ->
          if count > 0
            reject new Error "Oops, #{count} active connections leftover"
            return
          server.close ->
            resolve()
      null

The `exit` command must still return a valid response
-----------------------------------------------------

    test 'should receive a response on exit', ->

      await new Promise (resolve) ->

        client = FS.client ->

          @exit()
          .then (res) ->
            res.headers['Reply-Text'].should.match /^\+OK/
            resolve()
            client.end()
          .catch done

          return

        client.connect client_port, '127.0.0.1'
      return

The `exit` command normally triggers automatic cleanup
------------------------------------------------------

Automatic cleanup should trigger a `cleanup_disconnect` event.

    test 'should disconnect on exit', ->
      await new Promise (resolve) ->

        client = FS.client ->

          @once 'cleanup_disconnect', ->
            client.end()
            resolve()

          @exit()
          .catch done

        client.connect client_port, '127.0.0.1'
      return

    test 'should detect invalid syntax', ->
      await new Promise (resolve) ->

        client = FS.client ->

          @api "originate foobar"
          .catch (error) ->
            error.should.have.property 'args'
            error.args.should.have.property 'reply'
            error.args.reply.should.match /^-USAGE/
            client.end()
            resolve()

        client.connect client_port, '127.0.0.1'
      return

    test 'should detect invalid (late) syntax', ->
      id = uuid.v4()
      options =
        tracer_uuid: id

      await new Promise (resolve) ->
        client = FS.client ->
          @once 'CHANNEL_EXECUTE_COMPLETE', (res) ->
            res.body.variable_tracer_uuid.should.equal id
            res.body.variable_originate_disposition.should.equal 'CHAN_NOT_IMPLEMENTED'
            client.end()
            resolve()

          @api "originate [#{options_text options}]sofia/test-client/sip:answer-wait-3010@#{domain} &bridge(foobar)"

        client.connect client_port, '127.0.0.1'
      return

    test 'should detect missing host', (t) ->

It shouldn't take us more than 4 seconds (given the value of timer-T2 set to 2000).

      t.timeout 4000

The client attempt to connect an non-existent IP address on a valid subnet ("host down").

      await new Promise (resolve,reject) ->
        client = FS.client ->
          id = uuid.v4()
          options =
            leg_progress_timeout: 8
            leg_timeout: 16
            tracer_uuid: id

          duration = timer()
          @api "originate [#{options_text options}]sofia/test-client/sip:test@172.17.0.42 &park"
          .catch (error) ->
            error.should.have.property 'args'
            error.args.should.have.property 'command'
            error.args.command.should.contain "tracer_uuid=#{id}"
            error.args.should.have.property 'reply'
            error.args.reply.should.match /^-ERR RECOVERY_ON_TIMER_EXPIRE/
            duration().should.be.above 1*second
            duration().should.be.below 3*second
            client.end()
            resolve()
          .catch reject

        client.connect client_port, '127.0.0.1'
      return

    test 'should detect closed port', (t) ->

      t.timeout 2200

      await new Promise (resolve,reject) ->
        client = FS.client ->
          id = uuid.v4()
          options =
            leg_progress_timeout: 8
            leg_timeout: 16
            tracer_uuid: id

          duration = timer()
          @api "originate [#{options_text options}]sofia/test-client/sip:test@127.0.0.1:1310 &park"
          .catch (error) ->
            error.should.have.property 'args'
            error.args.should.have.property 'command'
            error.args.command.should.contain "tracer_uuid=#{id}"
            error.args.should.have.property 'reply'
            error.args.reply.should.match /^-ERR NORMAL_TEMPORARY_FAILURE/
            duration().should.be.below 4*second
            client.end()
            resolve()
          .catch reject

        client.connect client_port, '127.0.0.1'
      return

    test 'should detect invalid destination', (t) ->

      t.timeout 2200

      await new Promise (resolve,reject) ->
        client = FS.client ->
          id = uuid.v4()
          options =
            leg_progress_timeout: 8
            leg_timeout: 16
            tracer_uuid: id

          @api "originate [#{options_text options}]sofia/test-client/sip:foobared@#{domain} &park"
          .catch (error) ->
            error.should.have.property 'args'
            error.args.should.have.property 'command'
            error.args.command.should.contain "tracer_uuid=#{id}"
            error.args.should.have.property 'reply'
            error.args.reply.should.match /^-ERR NO_ROUTE_DESTINATION/
            client.end()
            resolve()
          .catch reject

        client.connect client_port, '127.0.0.1'
      return

    test 'should detect late progress', (t) ->

      t.timeout 10000

      await new Promise (resolve,reject) ->
        client = FS.client ->
          id = uuid.v4()
          options =
            leg_progress_timeout: 8
            leg_timeout: 16
            tracer_uuid: id

          duration = timer()
          @api "originate [#{options_text options}]sofia/test-client/sip:wait-24000-ring-ready@#{domain} &park"
          .catch (error) ->
            error.should.have.property 'args'
            error.args.should.have.property 'reply'
            error.args.reply.should.match /^-ERR PROGRESS_TIMEOUT/
            duration().should.be.above (options.leg_progress_timeout - 1)*second
            duration().should.be.below (options.leg_progress_timeout + 1)*second
            client.end()
            resolve()
          .catch reject

        client.connect client_port, '127.0.0.1'
      return

SIP Error detection
===================

    should_detect = (code,pattern) -> (t) ->
      t.timeout 1000
      await new Promise (resolve,reject) ->
        client = FS.client ->
          id = uuid.v4()
          options =
            leg_timeout: 2
            leg_progress_timeout: 16
            tracer_uuid: id

          @on 'CHANNEL_CREATE', (msg) ->
            msg.should.have.property 'body'
            msg.body.should.have.property 'variable_tracer_uuid', id
          @on 'CHANNEL_ORIGINATE', (msg) ->
            msg.should.have.property 'body'
            msg.body.should.have.property 'variable_tracer_uuid', id
          @once 'CHANNEL_HANGUP', (msg) ->
            msg.should.have.property 'body'
            msg.body.should.have.property 'variable_tracer_uuid', id
            msg.body.should.have.property 'variable_sip_term_status', code
          @on 'CHANNEL_HANGUP_COMPLETE', (msg) ->
            msg.should.have.property 'body'
            msg.body.should.have.property 'variable_tracer_uuid', id
            msg.body.should.have.property 'variable_sip_term_status', code
            msg.body.should.have.property 'variable_billmsec', '0'
            client.end()
            resolve()
          await @filter 'variable_tracer_uuid', id
          await @event_json 'ALL'
          @api "originate {#{options_text options}}sofia/test-client/sip:wait-100-respond-#{code}@#{domain} &park"
          .catch (error) ->
            error.should.have.property 'args'
            error.args.should.have.property 'reply'
            error.args.reply.should.match pattern
            error.should.have.property 'res'
          .catch reject

        client.connect client_port, '127.0.0.1'
      return

    # Anything below 4xx isn't an error
    test 'should detect 403', should_detect '403', /^-ERR CALL_REJECTED/
    test 'should detect 404', should_detect '404', /^-ERR UNALLOCATED_NUMBER/
    # test 'should detect 407', should_detect '407', ... res has variable_sip_hangup_disposition: 'send_cancel' but no variable_sip_term_status
    test 'should detect 408', should_detect '408', /^-ERR RECOVERY_ON_TIMER_EXPIRE/
    test 'should detect 410', should_detect '410', /^-ERR NUMBER_CHANGED/
    test 'should detect 415', should_detect '415', /^-ERR SERVICE_NOT_IMPLEMENTED/
    test 'should detect 450', should_detect '450', /^-ERR NORMAL_UNSPECIFIED/
    test 'should detect 455', should_detect '455', /^-ERR NORMAL_UNSPECIFIED/
    test 'should detect 480', should_detect '480', /^-ERR NO_USER_RESPONSE/
    test 'should detect 481', should_detect '481', /^-ERR NORMAL_TEMPORARY_FAILURE/
    test 'should detect 484', should_detect '484', /^-ERR INVALID_NUMBER_FORMAT/
    test 'should detect 485', should_detect '485', /^-ERR NO_ROUTE_DESTINATION/
    test 'should detect 486', should_detect '486', /^-ERR USER_BUSY/
    test 'should detect 487', should_detect '487', /^-ERR ORIGINATOR_CANCEL/
    test 'should detect 488', should_detect '488', /^-ERR INCOMPATIBLE_DESTINATION/
    test 'should detect 491', should_detect '491', /^-ERR NORMAL_UNSPECIFIED/
    test 'should detect 500', should_detect '500', /^-ERR NORMAL_TEMPORARY_FAILURE/
    test 'should detect 502', should_detect '502', /^-ERR NETWORK_OUT_OF_ORDER/
    test 'should detect 503', should_detect '503', /^-ERR NORMAL_TEMPORARY_FAILURE/
    test 'should detect 504', should_detect '504', /^-ERR RECOVERY_ON_TIMER_EXPIRE/
    test 'should detect 600', should_detect '600', /^-ERR USER_BUSY/
    test 'should detect 603', should_detect '603', /^-ERR CALL_REJECTED/
    test 'should detect 604', should_detect '604', /^-ERR NO_ROUTE_DESTINATION/
    test 'should detect 606', should_detect '606', /^-ERR INCOMPATIBLE_DESTINATION/
