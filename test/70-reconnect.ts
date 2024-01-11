import test from 'ava'

import {
  FreeSwitchClient
} from 'esl'

import {
  type Socket,
  createServer
} from 'node:net'
import { sleep } from './tools.js'
import { clientLogger } from './utils.js'

const client_port = 5623

test('should reconnect', async function (t) {
  t.timeout(30000)
  const start = function (): void {
    let run = 0
    const service = function (c: Socket): void {
      run++
      t.log(`Server run #${run} received connection`)
      c.on('error', function (error) {
        t.log(`Server run #${run} received error`, error)
      })
      c.on('data', function (data): void {
        void (async function () {
          try {
            t.log(`Server run #${run} received data`, data)
            switch (run) {
              case 1:
                t.log('Server run #1 sleeping')
                await sleep(500)
                t.log('Server run #1 close')
                c.destroy()
                break
              case 2:
                t.log('Server run #2 writing (auth)')
                c.write(`Content-Type: auth/request

`)
                t.log('Server run #2 sleeping')
                await sleep(500)
                t.log('Server run #2 writing (reply)')
                c.write(`
Content-Type: command/reply
Reply-Text: +OK accepted

Content-Type: text/disconnect-notice
Content-Length: 0
`)
                t.log('Server run #2 sleeping')
                await sleep(500)
                t.log('Server run #2 end')
                c.end()
                break
              case 3:
                t.log('Server run #3 end')
                try {
                  client.end()
                } catch (error) {}
                c.end()
                t.log('Server run #3 close')
                spoof.close()
                t.pass()
            }
          } catch (ex) { t.log(ex); t.fail() }
        })()
      })
      c.resume()
      c.write(`Content-Type: auth/request

`)
    }
    const spoof = createServer(service)
    spoof.listen(client_port, function () {
      t.log('Server ready')
    })
    spoof.on('close', function () {
      t.log('Server received close event')
    })
  }
  start()
  const client = new FreeSwitchClient({
    host: '127.0.0.1',
    port: client_port,
    logger: clientLogger(t)
  })
  client.on('error', function (error) {
    t.log('client error', error)
  })
  client.connect()
  await sleep(20000)
})
