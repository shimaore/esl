import { type FreeSwitchClientLogger, type FreeSwitchResponseLogger } from 'esl'
import { second, simple_start_client, simple_start_server, simple_stop } from './tools.js'
import { type ExecutionContext } from 'ava'

export const DoCatch = function <T>(t: ExecutionContext, f: () => Promise<T>): void {
  void f().catch(t.log)
}

export const start = async (t: ExecutionContext): Promise<void> => {
  t.timeout(12 * second)
  await Promise.all([
    start_client(t),
    start_server(t)
  ])
  t.pass()
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

export const start_client = async (t: ExecutionContext): Promise<void> => {
  t.timeout(12 * second)
  await simple_start_client(t.log)
  t.pass()
}

export const start_server = async (t: ExecutionContext): Promise<void> => {
  t.timeout(12 * second)
  await simple_start_server(t.log)
  t.pass()
}

export const stop = async (t: ExecutionContext): Promise<void> => {
  t.timeout(8 * second)
  await simple_stop(t.log)
  t.pass()
}
