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

// Sleep the given amount of milliseconds
export const sleep = async function (timeout: number): Promise<void> {
  await new Promise(function (resolve) {
    setTimeout(resolve, timeout)
  })
}

export const second = 1000

export const timer = function (): () => number {
  const now = process.hrtime.bigint()
  return function () {
    return Number(process.hrtime.bigint() - now) / 1_000_000
  }
}

// FIXME: conversion in general terms is more complex, value may contain comma, quote, etc.
export const options_text = function (options: Record<string, string | number>): string {
  let key, value
  return ((function () {
    const results = []
    for (key in options) {
      value = options[key]
      results.push(`${key}=${value}`)
    }
    return results
  })()).join(',')
}

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

export const simple_start_client = async (log: (...values: any[]) => void): Promise<void> => {
  const dir = `/tmp/client-${ulid()}`
  log('Starting FS with client profile')
  await mkdir(dir)
  fs_client = spawn('/usr/bin/freeswitch', [...common_options, '-cfgname', 'client.xml', '-log', dir, '-db', dir], {
    stdio: ['ignore', 'ignore', 'inherit']
  })
  if (fs_client != null) {
    fs_client.on('error', function (error) {
      log('fs_client error', error)
    })
    fs_client.once('exit', function (code, signal): void {
      void (async function () {
        log('fs_client exit', { code, signal })
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
    log('fs_client spawned')
  }
}

export const simple_start_server = async (log: (...values: any[]) => void): Promise<void> => {
  const dir = `/tmp/server-${ulid()}`
  log('Starting FS with server profile')
  await mkdir(dir)
  fs_server = spawn('/usr/bin/freeswitch', [...common_options, '-cfgname', 'server.xml', '-log', dir, '-db', dir], {
    stdio: ['ignore', 'ignore', 'inherit']
  })
  fs_server.on('error', function (error) {
    log('fs_server error', error)
  })
  fs_server.once('exit', function (code, signal): void {
    void (async function () {
      log('fs_server exit', { code, signal })
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
  log('fs_server spawned')
}

export const simple_stop = async (log: (...values: any[]) => void): Promise<void> => {
  await sleep(2 * second)
  log('Stopping FS')
  const p = fs_client != null ? new Promise((resolve) => fs_client?.once('exit', resolve)) : Promise.resolve(true)
  const q = fs_server != null ? new Promise((resolve) => fs_server?.once('exit', resolve)) : Promise.resolve(true)
  if (fs_client != null) {
    fs_client.kill()
    log('fs_client killed')
  }
  if (fs_server != null) {
    fs_server.kill()
    log('fs_server killed')
  }
  await Promise.all([p, q])
  log('Server(s) exited')
}
