import test from 'ava'

import {
  start,
  stop
} from './utils.js'

test.before(start)
test.after.always(stop)

test('01-ok', (t) => t.pass())
