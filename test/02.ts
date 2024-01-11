import test from 'ava'

import {
  FreeSwitchClient
  , once
} from 'esl'

import {
  clientLogger,
  start,
  stop
} from './utils.js'

const client_port = 8024

test.before(start)
test.after.always(stop)

test('02-ok', async (t) => {
  const client = new FreeSwitchClient({
    port: client_port,
    logger: clientLogger(t)
  })
  const p = once(client, 'connect')
  client.connect()
  await p
  client.end()
  t.pass()
})
