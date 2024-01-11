import test from 'ava'

import {
  FreeSwitchResponse
} from 'esl'
import { type Socket } from 'net'
import { responseLogger as logger } from './utils.js'

const socket = {
  once: function () { },
  on: function () { },
  end: function () { },
  write: function () { },
  setKeepAlive: function () { },
  setNoDelay: function () { }
} as unknown as Socket

test('01-args: should throw properly on closed (api)', async function (t) {
  const T = new FreeSwitchResponse(socket, logger(t))
  T.closed = true
  await T.api('foo').catch(function (error) {
    t.log(error)
    return t.is(error.args.when, 'api on closed socket')
  })
})

test('01-args: should throw properly on closed (bgapi)', async function (t) {
  const T = new FreeSwitchResponse(socket, logger(t))
  T.closed = true
  await T.bgapi('foo').catch(function (error) {
    t.log(error)
    return t.is(error.args.when, 'bgapi on closed socket')
  })
})
