import test from 'ava'

import {
  once
} from 'esl'

import {
  FreeSwitchClient, FreeSwitchError, type FreeSwitchEventData
} from 'esl'

import {
  clientLogger,
  start,
  stop
} from './utils.js'
import { sleep } from './tools.js'

// We start two FreeSwitch docker.io instances, one is used as the "client" (and is basically our SIP test runner), while the other one is the "server" (and is used to test the `server` side of the package).
const client_port = 8024

test.before(start)
test.after.always(stop)

test('10-client-image: should be reachable', async function (t) {
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

test('10-client-image: should report @once errors', async function (t) {
  const client = new FreeSwitchClient({
    port: client_port,
    logger: clientLogger(t)
  })
  const p = once(client, 'connect')
  client.connect()
  const [call] = (await p)
  const failure = (await call.send('catchme').then(function () {
    return false
  }, function () {
    return true
  }))
  client.end()
  if (failure != null) {
    t.pass()
  } else {
    t.fail()
  }
})

/*
test 'should detect and report login errors', (t) ->
  client = new FreeSwitchClient port: client_port, password: 'barfood'
  client.on 'connect',
    t.fail new Error 'Should not reach here'
    return
  client.on 'error', (error) ->
    t.pass()
    return
  client.connect()
return
*/
test('10-client-image: should reloadxml', async function (t) {
  const client = new FreeSwitchClient({
    port: client_port,
    logger: clientLogger(t)
  })
  const cmd = 'reloadxml'
  client.on('connect', function (call): void {
    void (async function () {
      try {
        const res = (await call.api(cmd))
        t.regex(res.body, /\+OK \[Success\]/)
        client.end()
        t.pass()
      } catch (ex) {
        t.log(ex)
        t.fail()
      }
    })()
  })
  client.connect()
  await sleep(500)
})

test.serial('10-client-image: should properly parse plainevents', async function (t) {
  const client = new FreeSwitchClient({
    port: client_port,
    logger: clientLogger(t)
  })
  client.on('connect', function (call): void {
    void (async function () {
      try {
        const res = (await call.send('event plain ALL'))
        t.regex(res.headers['Reply-Text'] ?? '', /\+OK event listener enabled plain/)
        const msgP = once(call, 'CUSTOM') as Promise<[FreeSwitchEventData]>
        await call.sendevent('CUSTOM', {
          'Event-Name': 'CUSTOM',
          'Event-XBar': 'some'
        })
        const [msg] = (await msgP)
        t.like(msg.body, {
          'Event-Name': 'CUSTOM',
          'Event-XBar': 'some'
        })
        await call.exit()
        client.end()
        t.pass()
      } catch (error1) {
        t.fail()
      }
    })()
  })
  client.connect()
  await sleep(500)
})

test.serial('10-client-image: should properly parse JSON events', async function (t) {
  const client = new FreeSwitchClient({
    port: client_port,
    logger: clientLogger(t)
  })
  client.on('connect', function (call): void {
    void (async function () {
      try {
        const res = (await call.send('event json ALL'))
        t.regex(res.headers['Reply-Text'] ?? '', /\+OK event listener enabled json/)
        const msgP = once(call, 'CUSTOM') as Promise<[FreeSwitchEventData]>
        await call.sendevent('CUSTOM', {
          'Event-Name': 'CUSTOM',
          'Event-XBar': 'ë°ñ'
        })
        const [msg] = (await msgP)
        t.like(msg.body, {
          'Event-Name': 'CUSTOM',
          'Event-XBar': 'ë°ñ'
        })
        await call.exit()
        client.end()
        t.pass()
      } catch (error1) {
        t.fail()
      }
    })()
  })
  client.connect()
  await sleep(500)
})

test.skip('10-client-image: should detect failed socket', async function (t) {
  t.timeout(1000)
  const client = new FreeSwitchClient({
    port: client_port,
    logger: clientLogger(t)
  })
  client.on('connect', function (call): void {
    void (async function () {
      try {
        const error = (await call.api('originate sofia/test-client/sip:server-failed@127.0.0.1:34564 &park').catch(function (error: unknown) {
          return error
        }))
        // FIXME currently return CHAN_NOT_IMPLEMENTED
        if (error instanceof FreeSwitchError && typeof error.args.reply === 'string') {
          t.regex(error.args.reply, /^-ERR NORMAL_TEMPORARY_FAILURE/)
        } else {
          t.fail()
        }
        client.end()
        t.pass()
      } catch (error) {
        t.fail()
      }
    })()
  })
  client.connect()
  await sleep(500)
})
