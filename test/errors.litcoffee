    import test from 'ava'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    import { start, stop } from './utils.mjs'

    second = 1000
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout

    import { v4 as uuidv4 } from 'uuid'
    import { EventEmitter, once } from 'node:events'

    client_port = 8024
    domain = '127.0.0.1:5062'

    test.before (t) ->
      t.timeout 9*second
      await start()
      await sleep 8*second
      return

    test.after 'Stop FreeSWITCH', (t) ->
      await stop()
      t.pass()

    do_show_stats = false

`leg_progress_timeout` counts from the time the INVITE is placed until a progress indication (e.g. 180, 183) is received. Controls Post-Dial-Delay on this leg.

`leg_timeout` restricts the length of ringback, à la `bridge_answer_timeout`

FIXME: conversion in general terms is more complex, value may contain comma, quote, etc.

    options_text = (options) -> ("#{key}=#{value}" for key, value of options).join ','

    timer = ->
      now = new Date()
      ->
        new Date() - now

    logger = (t) ->
      # debug: (...args) -> t.log 'debug', ...args
      debug: ->
      info: (...args) -> t.log 'info', ...args
      error: (...args) -> t.log 'error', ...args

This flag is used to hide extraneous messages (esp. benchmark data) during regular tests.

Test for error conditions
=========================

The goal is to document how to detect error conditions, especially wrt LCR conditions.

    server = null

    ev = new EventEmitter

    test.before (t) ->

      service = (call, {data}) ->

        destination = data.variable_sip_req_user

        switch
          when destination is 'answer-wait-3010'
            await call.command 'answer'
            await sleep 3010

          when destination is 'wait-24000-ring-ready'
            await sleep 24000
            await call.command('ring_ready').catch -> true
            await sleep 9999

          when m = destination.match /^wait-(\d+)-respond-(\d+)$/
            await sleep parseInt m[1]
            await call.command 'respond', m[2]
            await sleep 9999

          when destination is 'foobared'
            await call.command 'respond', 485

          else
            await call.command 'respond', 400

        return

      server = new FreeSwitchServer all_events:no, logger: logger t
      server.on 'connection', service
      await server.listen 7000
      t.pass()
      return

    test.after (t) ->
      t.timeout 10*second
      await sleep 8*second
      count = await server.getConnectionCount()
      t.is count, 0, "Oops, #{count} active connections leftover"
      await server.close()
      null

    test 'should handle `sofia status`', (t) ->
      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      res = await service.api 'sofia status'
      t.log res

      await client.end()
      t.pass()
      return

The `exit` command must still return a valid response
-----------------------------------------------------

    test 'should receive a response on exit', (t) ->
      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      res = await service.exit()
      t.regex res.headers['Reply-Text'], /^\+OK/

      await client.end()
      return

The `exit` command normally triggers automatic cleanup
------------------------------------------------------

Automatic cleanup should trigger a `cleanup_disconnect` event.

    test 'should disconnect on exit', (t) ->
      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      q = once service, 'cleanup_disconnect'
      await service.exit()
      await q
      t.pass()

      await client.end()
      return

    test 'should detect invalid syntax', (t) ->
      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      try
        await service.api "originate foobar"
        t.fail()
      catch error
        t.log error
        t.regex error.args.reply, /^-USAGE/

      await client.end()
      return

    test 'should process normal call', (t) ->
      t.timeout 5*second

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      res = await service.api "originate sofia/test-client/sip:answer-wait-3010@#{domain} &park"
      t.log 'API was successful', res
      t.pass()

      await client.end()
      return

    test 'should detect invalid (late) syntax', (t) ->
      t.timeout 5*second

      id = uuidv4()
      options =
        tracer_uuid: id

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      service.once 'CHANNEL_EXECUTE_COMPLETE', (res) ->
        t.is res.body.variable_tracer_uuid, id
        t.is res.body.variable_originate_disposition, 'CHAN_NOT_IMPLEMENTED'

      res = await service.api "originate [#{options_text options}]sofia/test-client/sip:answer-wait-3010@#{domain} &bridge(foobar)"
      t.log 'API was successful', res

      await sleep 1*second

      await client.end()
      return

    test 'should detect missing host', (t) ->

It shouldn't take us more than 4 seconds (given the value of timer-T2 set to 2000).

      t.timeout 4000

The client attempt to connect an non-existent IP address on a valid subnet ("host down").

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        leg_progress_timeout: 8
        leg_timeout: 16
        tracer_uuid: id

      duration = timer()
      try
        res = await service.api "originate [#{options_text options}]sofia/test-client/sip:test@172.16.0.42 &park"
        t.log 'API was successful', res
      catch error
        t.log 'API failed', error
        t.regex error.args.command, ///tracer_uuid=#{id}///
        t.regex error.args.reply, /^-ERR RECOVERY_ON_TIMER_EXPIRE/
        d = duration()
        t.true d > 1*second, "Duration is too short (#{d}ms)"
        t.true d < 3*second, "Duration is too long (#{d}ms)"

      await client.end()
      return

    test 'should detect closed port', (t) ->

      t.timeout 2200

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        leg_progress_timeout: 8
        leg_timeout: 16
        tracer_uuid: id

      duration = timer()
      try
        res = await service.api "originate [#{options_text options}]sofia/test-client/sip:test@127.0.0.1:1310 &park"
        t.log 'API was successful', res
      catch error
        t.log 'API failed', error
        t.regex error.args.command, ///tracer_uuid=#{id}///
        t.regex error.args.reply, /^-ERR NORMAL_TEMPORARY_FAILURE/
        d = duration()
        t.true d < 4*second, "Duration is too long (#{d}ms)"

      await client.end()
      return

    test 'should detect invalid destination', (t) ->

      t.timeout 2200

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        leg_progress_timeout: 8
        leg_timeout: 16
        tracer_uuid: id

      try
        await service.api "originate [#{options_text options}]sofia/test-client/sip:foobared@#{domain} &park"
      catch error
        t.regex error.args.command, ///tracer_uuid=#{id}///
        t.regex error.args.reply, /^-ERR NO_ROUTE_DESTINATION/

      await client.end()

      return

    test 'should detect late progress', (t) ->

      t.timeout 10000

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        leg_progress_timeout: 8
        leg_timeout: 16
        tracer_uuid: id

      duration = timer()
      try
        await service.api "originate [#{options_text options}]sofia/test-client/sip:wait-24000-ring-ready@#{domain} &park"
      catch error
        t.regex error.args.reply, /^-ERR PROGRESS_TIMEOUT/
        t.true duration() > (options.leg_progress_timeout - 1)*second
        t.true duration() < (options.leg_progress_timeout + 1)*second

      await client.end()

      return

SIP Error detection
===================

    should_detect = (code,pattern) -> (t) ->
      t.timeout 1000

      client = new FreeSwitchClient port: client_port, logger: logger t

      p = once client, 'connect'
      client.connect()
      [ service ] = await p

      id = uuidv4()
      options =
        leg_timeout: 2
        leg_progress_timeout: 16
        tracer_uuid: id

      t.log 'preparing'

      service.on 'CHANNEL_CREATE', (msg) ->
        t.like msg.body, variable_tracer_uuid: id
        return
      service.on 'CHANNEL_ORIGINATE', (msg) ->
        t.like msg.body, variable_tracer_uuid: id
        return
      service.once 'CHANNEL_HANGUP', (msg) ->
        t.like msg.body, {
          variable_tracer_uuid: id
          variable_sip_term_status: code
        }
        return
      service.on 'CHANNEL_HANGUP_COMPLETE', (msg) ->
        t.like msg.body, {
          variable_tracer_uuid: id
          variable_sip_term_status: code
          variable_billmsec: '0'
        }
        return

      await service.filter 'variable_tracer_uuid', id
      await service.event_json 'ALL'

      t.log "sending call for #{code}"
      try
        await service.api "originate {#{options_text options}}sofia/test-client/sip:wait-100-respond-#{code}@#{domain} &park"
      catch error
        t.regex error.args.reply, pattern
        t.true 'res' of error

      await sleep 50
      await client.end()
      return

    # Anything below 4xx isn't an error
    test.serial 'should detect 403', should_detect '403', /^-ERR CALL_REJECTED/
    test.serial 'should detect 404', should_detect '404', /^-ERR UNALLOCATED_NUMBER/
    # test 'should detect 407', should_detect '407', ... res has variable_sip_hangup_disposition: 'send_cancel' but no variable_sip_term_status
    test.serial 'should detect 408', should_detect '408', /^-ERR RECOVERY_ON_TIMER_EXPIRE/
    test.serial 'should detect 410', should_detect '410', /^-ERR NUMBER_CHANGED/
    test.serial 'should detect 415', should_detect '415', /^-ERR SERVICE_NOT_IMPLEMENTED/
    test.serial 'should detect 450', should_detect '450', /^-ERR NORMAL_UNSPECIFIED/
    test.serial 'should detect 455', should_detect '455', /^-ERR NORMAL_UNSPECIFIED/
    test.serial 'should detect 480', should_detect '480', /^-ERR NO_USER_RESPONSE/
    test.serial 'should detect 481', should_detect '481', /^-ERR NORMAL_TEMPORARY_FAILURE/
    test.serial 'should detect 484', should_detect '484', /^-ERR INVALID_NUMBER_FORMAT/
    test.serial 'should detect 485', should_detect '485', /^-ERR NO_ROUTE_DESTINATION/
    test.serial 'should detect 486', should_detect '486', /^-ERR USER_BUSY/
    test.serial 'should detect 487', should_detect '487', /^-ERR ORIGINATOR_CANCEL/
    test.serial 'should detect 488', should_detect '488', /^-ERR INCOMPATIBLE_DESTINATION/
    test.serial 'should detect 491', should_detect '491', /^-ERR NORMAL_UNSPECIFIED/
    test.serial 'should detect 500', should_detect '500', /^-ERR NORMAL_TEMPORARY_FAILURE/
    test.serial 'should detect 502', should_detect '502', /^-ERR NETWORK_OUT_OF_ORDER/
    test.serial 'should detect 503', should_detect '503', /^-ERR NORMAL_TEMPORARY_FAILURE/
    test.serial 'should detect 504', should_detect '504', /^-ERR RECOVERY_ON_TIMER_EXPIRE/
    test.serial 'should detect 600', should_detect '600', /^-ERR USER_BUSY/
    test.serial 'should detect 603', should_detect '603', /^-ERR CALL_REJECTED/
    test.serial 'should detect 604', should_detect '604', /^-ERR NO_ROUTE_DESTINATION/
    test.serial 'should detect 606', should_detect '606', /^-ERR INCOMPATIBLE_DESTINATION/
