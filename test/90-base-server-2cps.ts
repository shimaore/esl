import test from 'ava'

import {
  FreeSwitchClient,
  FreeSwitchError,
  type FreeSwitchResponse,
  FreeSwitchServer,
  type StringMap,
  once,
  FreeSwitchEventEmitter
} from 'esl'

import {
  start,
  stop
} from './utils.js'

import { second, sleep, clientLogger as logger, clientLogger, DoCatch } from './tools.js'

const domain = '127.0.0.1:5062'

// Next test the server at 2 cps call setups per second.
let server: FreeSwitchServer

const client_port = 8024

const cps = 2

const server3 = {
  stats: {
    received: 0,
    answered: 0,
    completed: 0
  }
}

const server1 = {
  stats: {
    received: 0,
    answered: 0,
    completed: 0
  }
}

const server2 = {
  stats: {
    received: 0,
    answered: 0,
    completed: 0
  }
}

// We implement a small LCR database using PouchDB.
const ev = new FreeSwitchEventEmitter()

test.before(async function (t) {
  const db = new Map<string, { _id: string, comment: string, target: string }>()
  db.set('route:',
    {
      _id: 'route:',
      comment: 'default',
      target: '324343'
    }
  )
  db.set('route:1',
    {
      _id: 'route:1',
      comment: 'NANPA',
      target: '37382'
    }
  )
  db.set('route:1435',
    {
      _id: 'route:1435',
      comment: 'some state',
      target: '738829'
    }
  )
  const service = async function (call: FreeSwitchResponse, { data }: { data: StringMap }): Promise<void> {
    const destination = data.variable_sip_req_user as string
    if (destination.match(/^lcr7010-\d+$/) != null) {
      server3.stats.received++
      call.once('freeswitch_disconnect', function () {
        return server3.stats.completed++
      })
      // The server builds a list of potential route entries (starting with longest match first)
      const $ = destination.match(/^lcr\d+-(\d+)$/)
      if ($ == null) return
      const dest = $[1]
      const ids = ((function () {
        const results = []
        let l, j, ref
        for (l = j = 0, ref = dest.length; (ref >= 0 ? j <= ref : j >= ref); l = ref >= 0 ? ++j : --j) {
          results.push(`route:${dest.slice(0, l)}`)
        }
        return results
      })()).reverse()
      // and these are retrieved from the database.
      const rows = ids.map(k => db.get(k))
      // The first successful route is selected.
      const doc = ((function () {
        const results = []
        const len = rows.length
        for (let j = 0; j < len; j++) {
          const row = rows[j]
          if (row != null) {
            results.push(row)
          }
        }
        return results
      })())[0]
      if (doc != null) {
        await call.command(`bridge sip:answer-wait-3000-${doc.target}@${domain}`)
      } else {
        t.log(`No route for ${dest}`)
        await call.hangup(`500 no route for ${dest}`)
      }
      return
    }
    if (destination.match(/^answer-wait-3000-\d+$/) != null) {
      await call.command('hangup', `200 destination ${destination}`)
      return
    }
    switch (destination) {
      case 'answer-wait-3050':
        await call.command('answer')
        await sleep(3050)
        await call.command('hangup', '200 answer-wait-3050')
        break
      case 'server7022':
        t.log('Received server7022')
        await call.command('set', 'a=2')
        await call.command('set', 'b=3')
        await call.command('set', 'c=4')
        t.log('Received server7022: calling exit')
        await call.exit()
        t.log('Received server7022: sending event')
        ev.emit('server7022')
        break
      case 'server7004': {
        server1.stats.received++
        // The call is considered completed if FreeSwitch properly notified us it was disconnecting.
        // This might not mean the call was successful.
        call.once('freeswitch_disconnect', function () {
          return server1.stats.completed++
        })
        const res = (await call.command('answer'))
        t.is(res.body['Channel-Call-State'], 'ACTIVE')
        server1.stats.answered++
        await sleep(3000)
        await call.hangup('200 server7004')
        break
      }
      case 'server7006': {
        server2.stats.received++
        call.once('freeswitch_disconnect', function () {
          return server2.stats.completed++
        })
        const res = (await call.command('answer'))
        t.is(res.body['Channel-Call-State'], 'ACTIVE')
        server2.stats.answered++
        break
      }
      default:
        throw new Error(`Invalid destination ${destination}`)
    }
  }
  server = new FreeSwitchServer({
    all_events: false, logger: clientLogger(t)
  })
  server.on('connection', async function (call, args: { data: StringMap }) {
    DoCatch(t, async function () {
      t.log('Server-side', call, args)
      try {
        await service(call, args)
      } catch (err) {
        t.log('Server-side error', err)
      }
    })
  })
  server.listen({
    port: 7000
  })
  await sleep(1 * second)
})

test.after.always(async function (t) {
  t.timeout(10 * second)
  await sleep(8 * second)
  const count = (await server.getConnectionCount())
  if (count > 0) {
    throw new Error(`Oops, ${count} active connections leftover`)
  }
  await server.close()
  t.pass()
})

test.before(start)
test.after.always(stop)

test('should handle many calls', async function (t): Promise<void> {
  const count = 20
  t.timeout(count / cps * second + 7000)
  let sent = 0
  const new_call = function (): void {
    void (async function () {
      try {
        const client = new FreeSwitchClient({
          port: client_port,
          logger: logger(t)
        })
        const p = once(client, 'connect')
        client.connect()
        const [service] = (await p)
        await service.api(`originate sofia/test-client/sip:server7004@${domain} &bridge(sofia/test-client/sip:server7006@${domain})`)
        sent += 1
        client.end()
      } catch (ex) {
        t.log(ex); t.fail()
      }
    })()
  }
  let i, j, ref
  for (i = j = 1, ref = count; (ref >= 1 ? j <= ref : j >= ref); i = ref >= 1 ? ++j : --j) {
    setTimeout(new_call, i * second / cps)
  }
  // Success criteria is that we received disconnect notifications from FreeSwitch for all calls.
  // This might fail for example because FreeSwitch runs out of CPU and starts sending 503 (max-cpu) errors back, meaning the client is unable to send all calls through up to our servers.
  await sleep(count / cps * second + 6000)
  t.log(`sent=${sent} count=${count} server1.stats.completed=${server1.stats.completed} server2.stats.completed=${server2.stats.completed}`)
  t.true(sent === count && server1.stats.completed === count && server2.stats.completed === count)
})

// Minimal LCR
// -----------
test('should do LCR', async function (t) {
  const count = 20
  t.timeout(count / cps * second + 9000)
  let sent = 0
  const new_call = function (): void {
    void (async function () {
      const client = new FreeSwitchClient({
        port: client_port,
        logger: logger(t)
      })
      const p = once(client, 'connect')
      client.connect()
      const [service] = (await p)
      // The client then calls using a predefined number, the call should be routed.
      // FIXME: extend the test to provide a list of successful and unsuccessful numbers and make sure they are routed / not routed accordingly.
      // NOTE: This test and many others are done in the [`tough-rate`](https://github.com/shimaore/tough-rate/blob/master/test/call_server.coffee.md#server-unit-under-test) module.
      await service.api(`originate sofia/test-client/sip:answer-wait-3050@${domain} &bridge(sofia/test-client/sip:lcr7010-362736237@${domain})`)
      sent += 1
      client.end()
    })()
  }
  let i, j, ref
  for (i = j = 1, ref = count; (ref >= 1 ? j <= ref : j >= ref); i = ref >= 1 ? ++j : --j) {
    setTimeout(new_call, i * second / cps)
  }
  await sleep(count / cps * second + 8000)
  t.log(`sent=${sent} count=${count} server1.stats.completed=${server1.stats.completed} server2.stats.completed=${server2.stats.completed}`)
  t.true(sent === count && server3.stats.completed === count)
})

// Multiple, chained commands
// ==========================
test('should handle chained commands', async function (t) {
  t.timeout(2000)
  const client = new FreeSwitchClient({
    port: client_port,
    logger: logger(t)
  })
  const p = once(client, 'connect')
  client.connect()
  const [service] = (await p)
  const q = once(ev, 'server7022')
  await service.event_json('ALL')
  try {
    await service.api(`originate sofia/test-client/sip:server7022@${domain} &park`)
  } catch (err) {
    t.log(err)
    if (err instanceof FreeSwitchError) {
      t.is(err.res?.body, '-ERR NORMAL_CLEARING\n')
    } else {
      t.fail()
    }
  }
  await q
  t.pass()
  client.end()
})
