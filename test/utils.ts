import {
  type ChildProcess,
  spawn
} from 'node:child_process'

import {
  mkdir,
  rm
} from 'node:fs/promises'

import {
  ulid
} from 'ulidx'
import { second, sleep } from './tools.js'
import { type ExecutionContext } from 'ava'

let fs_client: ChildProcess | null = null

let fs_server: ChildProcess | null = null

const common_options = [
  '-nf', // No forking
  '-c', // Console and foreground
  '-nosql',
  '-nonat', // Disable auto nat detection
  '-nocal', // Disable clock calibration
  '-nort',
  '-conf',
  '/opt/test'
]

export const start = async (t: ExecutionContext): Promise<void> => {
  t.timeout(12 * second)
  await Promise.all([
    start_client(t),
    start_server(t)
  ])
  t.pass()
}

export const start_client = async (t: ExecutionContext): Promise<void> => {
  t.timeout(12 * second)
  const dir = `/tmp/client-${ulid()}`
  t.log('Starting FS with client profile')
  await mkdir(dir)
  fs_client = spawn('/usr/bin/freeswitch', [...common_options, '-cfgname', 'client.xml', '-log', dir, '-db', dir], {
    stdio: ['ignore', 'inherit', 'inherit']
  })
  if (fs_client != null) {
    fs_client.on('error', function (error) {
      t.log('fs_client error', error)
    })
    fs_client.once('exit', function (code, signal): void {
      void (async function () {
        t.log('fs_client exit', { code, signal })
        try {
          await rm(dir, {
            recursive: true,
            force: true
          })
        } catch (error1) {}
        if (code !== 0) {
          process.exit(1)
        }
        fs_client = null
      })()
    })
    await new Promise((resolve) => fs_client?.once('spawn', resolve))
    await sleep(4 * second)
    t.log('fs_client spawned')
  }
}

export const start_server = async (t: ExecutionContext): Promise<void> => {
  t.timeout(12 * second)
  const dir = `/tmp/server-${ulid()}`
  t.log('Starting FS with server profile')
  await mkdir(dir)
  fs_server = spawn('/usr/bin/freeswitch', [...common_options, '-cfgname', 'server.xml', '-log', dir, '-db', dir], {
    stdio: ['ignore', 'inherit', 'inherit']
  })
  fs_server.on('error', function (error) {
    t.log('fs_server error', error)
  })
  fs_server.once('exit', function (code, signal): void {
    void (async function () {
      t.log('fs_server exit', { code, signal })
      try {
        await rm(dir, {
          recursive: true,
          force: true
        })
      } catch (error1) {}
      if (code !== 0) {
        process.exit(1)
      }
      fs_server = null
    })()
  })
  await new Promise((resolve) => fs_server?.once('spawn', resolve))
  await sleep(4 * second)
  t.log('fs_server spawned')
}

export const stop = async (t: ExecutionContext): Promise<void> => {
  t.timeout(8 * second)
  await sleep(2 * second)
  t.log('Stopping FS')
  const p = fs_client != null ? new Promise((resolve) => fs_client?.once('exit', resolve)) : Promise.resolve(true)
  const q = fs_server != null ? new Promise((resolve) => fs_server?.once('exit', resolve)) : Promise.resolve(true)
  if (fs_client != null) {
    fs_client.kill()
    t.log('fs_client killed')
  }
  if (fs_server != null) {
    fs_server.kill()
    t.log('fs_server killed')
  }
  await Promise.all([p, q])
  t.pass()
}
