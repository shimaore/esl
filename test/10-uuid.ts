import test from 'ava'

import {
  FreeSwitchClient,
  type FreeSwitchEventData,
  type FreeSwitchResponse,
  FreeSwitchServer,
  type StringMap
} from 'esl'

import {
  once
} from 'esl'

import {
  start_server,
  stop,
  clientLogger, serverLogger
} from './utils.js'
import { second, sleep } from './tools.js'

// Using UUID (in client mode)
// ---------------------------
test.before(start_server)
test.after.always(stop)

const server_port = 8022

const domain = '127.0.0.1:5062'

let server: FreeSwitchServer | null = null
test.before(async (t) => {
  server = new FreeSwitchServer({
    all_events: true,
    my_events: false,
    logger: serverLogger(t)
  })

  const service = function (call: FreeSwitchResponse, { data }: { data: StringMap }): void {
    void (async function () {
      try {
        const destination = data.variable_sip_req_user
        t.log('Service started', { destination })
        switch (destination) {
          case 'answer-wait-30000':
            t.log('Service answer')
            await call.command('answer')
            t.log('Service wait 30s')
            await sleep(30 * second)
            break
          default:
            t.log(`Invalid destination ${destination}`)
        }
        t.log('Service hanging up')
        await call.hangup()
        t.log('Service hung up')
      } catch (ex) {
        t.log(ex)
      }
    })()
  }

  server.on('connection', service)

  server.on('error', function (error) {
    console.log('Service', error)
  })

  await server.listen({
    port: 7000
  })
})
test.after.always(async (t) => {
  t.timeout(10 * second)
  await sleep(7 * second)
  const count = (await server?.getConnectionCount())
  t.is(count, 0, `Oops, ${count} active connections leftover`)
  await server?.close()
  t.log('Service closed')
})

test('should handle UUID-based commands', async function (t) {
  t.timeout(20000)
  const logger = clientLogger(t)
  const client = new FreeSwitchClient({
    port: server_port,
    logger
  })
  client.connect()
  const [call] = (await once(client, 'connect'))
  await call.event_json('ALL')
  const origination_uuid = '1829'
  const res1 = (await call.api(`originate {origination_uuid=${origination_uuid},origination_channel_name='1234'}sofia/test-server/sip:answer-wait-30000@${domain} &park`))
  t.true('uuid' in res1)
  const call_uuid = res1.uuid
  t.is(call_uuid, origination_uuid)
  await sleep(1000)
  const res2 = (await call.command_uuid(call_uuid, 'hangup'))
  t.true('body' in res2)
  t.true('Hangup-Cause' in res2.body)
  t.is(res2.body['Hangup-Cause'], 'NORMAL_CLEARING')
  client.end()
})

test('should map sequential responses', async function (t) {
  const client = new FreeSwitchClient({
    port: server_port, logger: clientLogger(t)
  })
  client.connect()
  const [call] = (await once(client, 'connect'))
  const res1 = (await call.api('create_uuid'))
  const uuid_1 = res1.body
  const res2 = (await call.api('create_uuid'))
  const uuid_2 = res2.body
  client.end()
  t.not(uuid_1, uuid_2, 'UUIDs should be unique')
})

test('should map sequential responses (using bgapi)', async function (t) {
  const client = new FreeSwitchClient({
    port: server_port, logger: clientLogger(t)
  })
  client.connect()
  const [call] = (await once(client, 'connect'))
  const res1 = (await call.bgapi('create_uuid'))
  const uuid_1 = res1.body
  const res2 = (await call.bgapi('create_uuid'))
  const uuid_2 = res2.body
  client.end()
  t.not(uuid_1, uuid_2, 'UUIDs should be unique')
})

test('should map sequential responses (sent in parallel)', async function (t) {
  const client = new FreeSwitchClient({
    port: server_port, logger: clientLogger(t)
  })
  client.connect()
  const [call]: FreeSwitchResponse[] = (await once(client, 'connect'))
  let uuid_1: string | null = null
  let uuid_2: string | null = null
  const p1 = call.api('create_uuid').then((res): null => {
    uuid_1 = res.body
    return null
  })
  const p2 = call.api('create_uuid').then((res): null => {
    uuid_2 = res.body
    return null
  })
  await Promise.all([p1, p2])
  client.end()
  t.true(uuid_1 != null, 'Not sequential')
  t.true(uuid_2 != null, 'Not sequential')
  t.not(uuid_1, uuid_2, 'UUIDs should be unique')
})

test('should work with parallel responses (using api)', async function (t) {
  const client = new FreeSwitchClient({
    port: server_port, logger: clientLogger(t)
  })
  client.connect()
  const [call]: FreeSwitchResponse[] = (await once(client, 'connect'))
  let uuid_1: string | null = null
  let uuid_2: string | null = null
  const p1 = call.api('create_uuid').then((res): null => {
    uuid_1 = res.body
    return null
  })
  const p2 = call.api('create_uuid').then((res): null => {
    uuid_2 = res.body
    return null
  })
  await Promise.all([p1, p2])
  client.end()
  t.true(uuid_1 != null, 'Not sequential')
  t.true(uuid_2 != null, 'Not sequential')
  t.not(uuid_1, uuid_2, 'UUIDs should be unique')
})

test('should work with parallel responses (using bgapi)', async function (t) {
  const client = new FreeSwitchClient({
    port: server_port, logger: clientLogger(t)
  })
  client.connect()
  const [call]: FreeSwitchResponse[] = (await once(client, 'connect'))
  let uuid_1 = null
  let uuid_2 = null
  const p1 = call.bgapi('create_uuid').then((res): null => {
    t.log('uuid_1', res)
    uuid_1 = res.body
    return null
  })
  const p2 = call.bgapi('create_uuid').then((res): null => {
    t.log('uuid_2', res)
    uuid_2 = res.body
    return null
  })
  await Promise.all([p1, p2])
  client.end()
  t.true(uuid_1 != null, 'Not sequential')
  t.true(uuid_2 != null, 'Not sequential')
  t.not(uuid_1, uuid_2, 'UUIDs should be unique')
})

test('should handle errors', async function (t) {
  t.timeout(2000)
  const client = new FreeSwitchClient({
    port: server_port, logger: clientLogger(t)
  })
  client.connect()
  const [call]: FreeSwitchResponse[] = (await once(client, 'connect'))
  await call.event_json('ALL')
  const res = (await call.api(`originate sofia/test-server/sip:answer-wait-30000@${domain} &park`))
  t.true('uuid' in res)
  const call_uuid = res.uuid
  const ref = process.hrtime.bigint()
  const p = (async () => { // parallel
    const res = (await call.command_uuid(call_uuid, 'play_and_get_digits', '4 5 3 20000 # silence_stream://4000 silence_stream://4000 choice \\d 1000', 4200))
    const now = process.hrtime.bigint()
    const duration = now - ref
    t.true(duration > 1000000000n)
    t.true(duration < 1200000000n)
    t.like(res, {
      body: {
        'Answer-State': 'hangup',
        'Hangup-Cause': 'NO_PICKUP'
      }
    })
  })()
  await sleep(1000)
  await call.hangup_uuid(call_uuid, 'NO_PICKUP')
  await sleep(500)
  client.end()
  await p
})

// Test DTMF
// ---------

// This test should work but I haven't taken the time to finalize it.
test.skip('should detect DTMF', async function (t) {
  t.timeout(9000)
  const server = new FreeSwitchServer({
    all_events: false, logger: clientLogger(t)
  })
  server.on('connection', function (call) {
    void (async function () {
      try {
        await call.event_json('DTMF')
        await call.api('sofia global siptrace on')
        await call.command('answer')
        await call.command('start_dtmf')
        t.log('answered')
        await call.command('sleep', '10000')
        await sleep(10000)
        await call.exit
      } catch (ex) {
        t.log(ex)
        t.fail()
      }
    })()
  })
  await server.listen({ port: 7012 })
  const client = new FreeSwitchClient({
    port: server_port,
    logger: clientLogger(t)
  })
  client.on('connect', function (call: FreeSwitchResponse): void {
    void (async function () {
      try {
        let core_uuid = null
        call.on('CHANNEL_OUTGOING', function (msg: FreeSwitchEventData) {
          core_uuid = msg.body['Unique-ID']
          t.log('CHANNEL_OUTGOING', { core_uuid })
        })
        await call.event_json('ALL')
        await call.api('sofia status')
        await call.api('sofia global siptrace on')
        const msg = (await call.api(`originate sofia/test-server/sip:server7012@${domain} &park`))
        const $ = msg.body.match(/\+OK ([\da-f-]+)/)
        if ($ != null) {
          const channel_uuid = $[1]
          t.log('originate', { channel_uuid })
          await sleep(2000)
          const msg = (await call.api(`uuid_send_dtmf ${channel_uuid} 1234`))
          t.log('api', msg)
          await sleep(5000)
          t.pass()
        } else {
          t.fail()
        }
      } catch (ex) {
        t.log(ex)
        t.fail()
      }
    })()
  })
  client.connect()
})
