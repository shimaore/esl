import test from 'ava'

import {
  FreeSwitchClient
  , once
} from 'esl'

import {
  type Socket,
  createServer
} from 'node:net'

import { clientLogger, sleep } from './tools.js'

const client_port = 5624

test('should send commands', async function (t) {
  t.timeout(30000)
  let connection = 0
  const service = function (c: Socket): void {
    t.log(`Server received ${++connection} connection`)
    c.on('error', (error): void => {
      t.log('Server received error', error)
    })
    c.on('data', function (original_data) {
      void (async function () {
        try {
          const data = original_data.toString('utf-8')
          t.log('Server received data', data)
          await sleep(100)
          t.log('Server writing (reply ok)')
          c.write(`Content-Type: command/reply
Reply-Text: +OK accepted

`)
          if (data.match(/bridge[^]*foo/) != null) {
            await sleep(100)
            t.log('Server writing (execute-complete for bridge)')
            const $ = data.match(/Event-UUID: (\S+)/)
            if ($ != null) {
              const event_uuid = $[1]
              const msg = `Content-Type: text/event-plain
Content-Length: ${97 + event_uuid.length}

Event-Name: CHANNEL_EXECUTE_COMPLETE
Application: bridge
Application-Data: foo
Application-UUID: ${event_uuid}

`
              c.write(msg)
            }
          }
          if (data.match(/ping[^]*bar/) != null) {
            await sleep(100)
            t.log('Server writing (execute-complete for ping)')
            const $ = data.match(/Event-UUID: (\S+)/)
            if ($ != null) {
              const event_uuid = $[1]
              const msg = `
Content-Type: text/event-plain
Content-Length: ${95 + event_uuid.length}

Event-Name: CHANNEL_EXECUTE_COMPLETE
Application: ping
Application-Data: bar
Application-UUID: ${event_uuid}

`
              c.write(msg)
            }
          }
        } catch (ex) { t.log(ex); t.fail() }
      })()
    })
    c.on('end', function () {
      t.log('Server end')
    })
    c.resume()
    t.log('Server writing (auth)')
    c.write(`
Content-Type: auth/request

`)
  }
  const spoof = createServer(service)
  spoof.listen(client_port, function () {
    t.log('Server ready')
  })
  spoof.on('close', function () {
    t.log('Server received close event')
  })
  const w = new FreeSwitchClient({
    host: '127.0.0.1',
    port: client_port,
    logger: clientLogger(t)
  })
  t.log('Awaiting connect')
  w.connect()
  t.log('Awaiting FreeSwitchResponse object')
  const [call] = (await once(w, 'connect'))
  t.log('Client is connected')
  await call.command('bridge', 'foo')
  t.log('Client sending again')
  await call.command('ping', 'bar')
  t.log('Client requesting end')
  await call.end()
  w.end()
  spoof.close()
  t.pass()
})
