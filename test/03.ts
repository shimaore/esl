import test from 'ava'

import {
  once
  ,
  FreeSwitchClient,
  FreeSwitchServer
} from 'esl'

import {
  start,
  stop
} from './utils.js'

import {
  clientLogger,
  serverLogger,
  DoCatch
} from './tools.js'

const client_port = 8024
const domain = '127.0.0.1:5062'

test.before(start)
test.after.always(stop)

test('03-ok', async (t) => {
  const server = new FreeSwitchServer({
    all_events: false, logger: serverLogger(t)
  })
  server.once('connection', (call) => {
    DoCatch(t, async () => {
      t.log('server: call command answer')
      await call.command('answer')
      t.log('server: call command hangup')
      await call.command('hangup')
      t.log('server: call end')
      call.end()
    })
  })
  await server.listen({ port: 7000 })

  const client = new FreeSwitchClient({
    port: client_port, logger: clientLogger(t)
  })
  const p = once(client, 'connect')
  client.connect()
  const [service] = await p
  t.log('client: service bgapi originate')
  await service.bgapi(`originate sofia/test-client/sip:server7002@${domain} &park`, 1000)
  t.log('client: service hangup')
  try {
    await service.hangup()
  } catch (err) {
    t.log('client: service hangup', err)
  }
  t.log('client: end')
  client.end()
  await server.close()
  t.pass()
})
