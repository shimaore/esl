    import { test } from 'ava'
    import { FreeSwitchClient } from 'esl'

We start two FreeSwitch docker.io instances, one is used as the "client" (and is basically our SIP test runner), while the other one is the "server" (and is used to test the `server` side of the package).

    server_port = 8022

    test 'should be reachable', (t) ->
      await new Promise (resolve) ->
        client = new FreeSwitchClient port: server_port
        client.once 'connect', ->
          await client.end()
          resolve()
        client.connect()
      t.pass()
      return

    test 'should reloadxml', (t) ->
      await new Promise (resolve,reject) ->
        cmd = 'reloadxml'
        client = new FreeSwitchClient port: server_port
        client.once 'connect', (call) ->
          res = await call.api cmd
          reject() unless res.body.match /\+OK \[Success\]/
          await client.end()
          resolve()
        client.connect()
      t.pass()
      return
