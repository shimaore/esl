import { type ExecutionContext } from 'ava'
import { type FreeSwitchResponseLogger, type FreeSwitchClientLogger } from '../src/esl.js'

// Sleep the given amount of milliseconds
export const sleep = async function (timeout: number): Promise<void> {
  await new Promise(function (resolve) {
    setTimeout(resolve, timeout)
  })
}

export const DoCatch = function <T>(t: ExecutionContext, f: () => Promise<T>): void {
  void f().catch(t.log)
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

export const clientLogger = function (t: ExecutionContext): FreeSwitchClientLogger {
  return {
    // debug: (msg, obj) => { t.log('clientLogger:debug', msg, obj) },
    debug: (_msg, _obj) => { },
    info: (msg, obj) => { t.log('clientLogger:info', msg, obj) },
    error: (msg, obj) => { t.log('clientLogger:error', msg, obj) }
  }
}

export const serverLogger = function (t: ExecutionContext): FreeSwitchClientLogger {
  return {
    // debug: (msg, obj) => { t.log('serverLogger:debug', msg, obj) },
    debug: (_msg, _obj) => { },
    info: (msg, obj) => { t.log('serverLogger:info', msg, obj) },
    error: (msg, obj) => { t.log('serverLogger:error', msg, obj) }
  }
}

export const responseLogger = function (t: ExecutionContext): FreeSwitchResponseLogger {
  return {
    // debug: (msg, obj) => { t.log('responseLogger:debug', msg, obj) },
    debug: (_msg, _obj) => { },
    info: (msg, obj) => { t.log('responseLogger:info', msg, obj) },
    error: (msg, obj) => { t.log('responseLogger:error', msg, obj) }
  }
}
