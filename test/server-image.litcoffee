    import test from 'ava'
    import { once } from 'node:events'
    import { FreeSwitchClient } from 'esl'
    import { start_server, stop } from './utils.mjs'

    second = 1000
    sleep = (t) -> new Promise (resolve) -> setTimeout resolve, t; return

    server_port = 8022

    await start_server()
    await sleep 2*second

    test 'should be reachable', (t) ->
      client = new FreeSwitchClient port: server_port
      p = once client, 'connect'
      client.connect()
      await p
      await client.end()
      t.pass()
      return

    test 'should reloadxml', (t) ->
      cmd = 'reloadxml'
      client = new FreeSwitchClient port: server_port
      p = once client, 'connect'
      client.connect()
      [ call ] = await p
      res = await call.api cmd
      t.regex res.body, /\+OK \[Success\]/
      await client.end()
      t.pass()
      return

    test 'Stop FreeSWITCH', (t) ->
      await sleep 2*second
      await stop()
      await sleep 2*second
      t.true yes
