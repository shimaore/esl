// Tests from README

import test from 'ava';
import {
  start,
  stop
} from './utils.mjs';

await start();

const second = 1000;

const sleep = function(timeout) {
  return new Promise(function(resolve) {
    return setTimeout(resolve, timeout);
  });
};

await sleep(2 * second);

// Code from the README
import { FreeSwitchClient } from 'esl'
import { once } from 'node:events'

test('should execute as client', async function(t) {
  const client = new FreeSwitchClient({
    port: 8021
  })

  const fs_command = async (cmd) => {
    const p = once(client,'connect')
    await client.connect()
    const [ call ] = await p
    const res = await call.api(cmd)
    t.regex( res.body, /\+OK/);
    await call.exit();
    client.end();
  }

  await fs_command("reloadxml");
  t.pass()
})

test('should shutdown', (t) => {
  stop();
  t.pass();
})
