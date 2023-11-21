import { FreeSwitchClient } from 'esl';
import test from 'ava';
test('it should load the module', t => {
    t.truthy(FreeSwitchClient);
});
