import test from 'ava'

import {
  FreeSwitchClient,
  type FreeSwitchResponse,
  FreeSwitchServer
} from 'esl'

import {
  start,
  stop
} from './utils.js'
import { clientLogger, second, sleep } from './tools.js'

const client_port = 8024

const dialplan_port = 7000

const domain = '127.0.0.1:5062'

test.before(start)
test.after.always(async function (t) {
  t.timeout(50 * second)
  // Ava runs tests in parallel, so let's wait long enough for the other tests to
  // complete!
  await sleep(30 * second)
  await stop(t)
})

test('should be reachable', async function (t) {
  t.timeout(35 * second)
  const logger = clientLogger(t)
  const client = new FreeSwitchClient({
    port: client_port,
    logger
  })
  const server = new FreeSwitchServer({
    logger
  })
  await server.listen({
    port: dialplan_port
  })
  const server2 = new FreeSwitchServer({
    logger
  })
  await server2.listen({
    port: dialplan_port + 1
  })
  const report = function (): void {
    void (async function () {
      t.log({
        server: server.stats,
        server2: server2.stats,
        connection_count: (await server.getConnectionCount()),
        max_connections: server.getMaxConnections(),
        runs,
        sent_calls,
        received_calls,
        received_completed_calls
      })
    })()
  }
  const timer = setInterval(report, 1000)
  let received_calls = 0n
  let received_completed_calls = 0n
  const server_handler = function (call: FreeSwitchResponse): void {
    void (async function () {
      try {
        received_calls++
        await call.command('ring_ready')
        await call.command('answer')
        await sleep(7 * second)
        await call.hangup()
        received_completed_calls++
      } catch (err) {
        t.log('------ receiving side', err)
      }
    })()
  }
  server.on('connection', server_handler)
  server2.on('connection', server_handler)
  const attempts = 500n
  let runs = attempts
  let sent_calls = 0n
  client.on('connect', function (service): void {
    void (async function () {
      t.log('---------- service ------------')
      try {
        let running = true
        while (runs-- > 0 && running) {
          await sleep(10) // 100 cps
          void (async function () {
            let err
            try {
              await service.bgapi(`originate sofia/test-client/sip:test@${domain} &park`)
              sent_calls++
            } catch (error) {
              err = error
              t.log('------ stopped run -----', err)
              running = false
            }
          })()
        }
      } catch (ex) {
        t.log(ex)
        t.fail()
      }
    })()
  })
  client.connect()
  await sleep(20 * second)
  clearInterval(timer)
  client.end()
  await server.close()
  await server2.close()
  t.log(`------ runs: ${runs} sent_calls: ${sent_calls} received_calls: ${received_calls} received_completed_calls: ${received_completed_calls} ---------------`)
  if (received_completed_calls === attempts) {
    t.pass()
  } else {
    t.fail()
  }
})
