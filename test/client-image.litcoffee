    import test from 'ava'
    import { once } from 'node:events'
    import {
      FreeSwitchClient
      FreeSwitchServer
    } from 'esl'
    import { start_server, start_client, stop } from './utils.mjs'

    second = 1000
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout

We start two FreeSwitch docker.io instances, one is used as the "client" (and is basically our SIP test runner), while the other one is the "server" (and is used to test the `server` side of the package).

    client_port = 8024

    await start_server()
    await start_client()
    await sleep 2*second

    test 'should be reachable', (t) ->
      client = new FreeSwitchClient port: client_port
      p = once client, 'connect'
      client.connect()
      await p
      await client.end()
      t.pass()
      return

    test 'should report @once errors', (t) ->
      client = new FreeSwitchClient port: client_port
      p = once client, 'connect'
      client.connect()
      call = await p
      success = once call, 'socket.error'
      failure = call.send 'catchme'
      await client.end()
      await success
      if await failure.then (-> no), (-> yes)
        t.pass()
      else
        t.fail()
      return

    ###
    test 'should detect and report login errors', (t) ->
      await new Promise (resolve,reject) ->
        client = new FreeSwitchClient port: client_port, password: 'barfood'
        client.on 'connect',
          reject new Error 'Should not reach here'
        client.on 'error', (error) ->
          resolve error
        client.connect()
      t.pass()
      return

    test 'should reloadxml', (t) ->
      await new Promise (resolve) ->
        client = new FreeSwitchClient port: client_port
        cmd = 'reloadxml'
        client.on 'connect',
          res = await call.api cmd
          res.body.should.match /\+OK \[Success\]/
          await client.end()
          resolve()
        client.connect()
      t.pass()
      return

    test 'should properly parse plain events', (t) ->
      t.timeout 2000
      await new Promise (resolve,reject) ->
        client = new FreeSwitchClient port: client_port
        cmd = 'event plain ALL'
        client.on 'connect', (call) ->
          try
            msg = await call.onceAsync 'CUSTOM'
            msg.body.should.have.property 'Event-Name', 'CUSTOM'
            msg.body.should.have.property 'Event-XBar', 'some'

            res = await call.send cmd
            res.headers['Reply-Text'].should.match /\+OK event listener enabled plain/
            await call.sendevent 'foo', 'Event-Name':'CUSTOM', 'Event-XBar':'some'
            await sleep 1000
            await call.exit()
            await client.end()
            resolve()
          catch error
            reject error
          return
        client.connect()
      t.pass()
      return

    test 'should properly parse JSON events', (t) ->
      t.timeout 2000
      await new Promise (resolve,reject) ->
        cmd = 'event json ALL'
        client = new FreeSwitchClient port: client_port
        client.on 'connect', (call) ->
          try
            msg = await call.onceAsync 'CUSTOM'
            msg.body.should.have.property 'Event-Name', 'CUSTOM'
            msg.body.should.have.property 'Event-XBar', 'ë°ñ'
            res = await call.send cmd
            res.headers['Reply-Text'].should.match /\+OK event listener enabled json/
            await call.sendevent 'foo', 'Event-Name':'CUSTOM', 'Event-XBar':'ë°ñ'
            await sleep 1000
            await call.exit()
            await client.end()
            resolve()
          catch error
            reject error
          return
        client.connect()
      t.pass()
      return

FIXME re-write another test that actually detects that the call went to FreeSwitch but the socket was unavailable on the back-end.

    test 'should detect failed socket', (t) ->

      t.timeout 1000

      await new Promise (resolve,reject) ->
        client = new FreeSwitchClient port: client_port
        client.on 'connect', (call) ->
          try
            error = api "originate sofia/test-client/sip:server-failed@127.0.0.1:34564 &park"
            .catch (error) -> error
            error.should.have.property 'args'
            error.args.should.have.property 'reply'
            error.args.reply.should.match /^-ERR NORMAL_TEMPORARY_FAILURE/
            await client.end()
            resolve()
          catch error
            reject error

        client.connect()
      t.pass()
      return
    ###
