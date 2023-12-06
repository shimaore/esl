import test from 'ava'

import {
  once
} from 'esl'

import {
  FreeSwitchClient, type FreeSwitchResponse
} from 'esl'

import {
  start_server,
  stop
} from './utils.js'
import { clientLogger } from './tools.js'

const server_port = 8022

test.before(async (t) => {
  await start_server(t)
  t.pass()
})
test.after.always(stop)

test('10-server-image: should be reachable', async function (t) {
  const client = new FreeSwitchClient({
    port: server_port,
    logger: clientLogger(t)
  })
  const p = once(client, 'connect')
  client.connect()
  await p
  client.end()
  t.pass()
})

test('10-server-image: should reloadxml', async function (t) {
  const cmd = 'reloadxml'
  const client = new FreeSwitchClient({
    port: server_port,
    logger: clientLogger(t)
  })
  const p = once(client, 'connect') as Promise<[FreeSwitchResponse]>
  client.connect()
  const [call] = (await p)
  const res = (await call.api(cmd))
  t.regex(res.body, /\+OK \[Success\]/)
  client.end()
  t.pass()
})
