import test from 'ava'

import {
  FreeSwitchClient
  ,
  once
} from 'esl'

import {
  createServer
} from 'node:net'

import { sleep } from './tools.js'
import { clientLogger } from './utils.js'

const client_port = 5621

test('01-buffer-at-end: should be empty at end of stream', async function (t) {
  try {
    const spoof = createServer({
      keepAlive: true
    })
    spoof.on('connection', function (c) {
      c.write(`Content-Type: auth/request

`)
      c.on('data', function (): void {
        void (async function (): Promise<void> {
          try {
            await sleep(250)
            c.write(`
Content-Type: command/reply
Reply-Text: +OK accepted

Content-Type: text/disconnect-notice
Content-Length: 3

Disconnected, filling your buffer with junk.
`)
          } catch (ex) { t.log(ex); t.fail() }
          spoof.close()
        })()
      })
    })
    spoof.on('listening', function () {
      t.log('Server ready')
    })
    spoof.listen({
      port: client_port
    })
    const logger = clientLogger(t)
    const client = new FreeSwitchClient({
      host: '127.0.0.1',
      port: client_port,
      logger
    })
    const pCall = once(client, 'connect')
    const pExpect = once(client, 'warning')
    client.connect()
    t.log('buffer-at-end: called connect')
    const [call] = (await pCall)
    t.log('buffer-at-end: got call', {
      ref: call.ref(),
      uuid: call.uuid()
    })
    await sleep(200)
    const [error] = (await pExpect)
    t.log(`buffer-at-end: got error ${error}`, error)
    t.is(error.error, 'Buffer is not empty at end of stream')
    client.end()
    spoof.close()
  } catch (error) {
    t.log('buffer-at-end: unexpected failure', error)
  }
})
