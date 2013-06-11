FS = require '../lib/esl'

log = -> console.log arguments...

assert = require 'assert'

FS.client (call) ->
  log '--- Client started'
  outcome = call.sequence [
    ->
      log '--- Connecting to server'
      @command 'socket', '127.0.0.1:7000 async full'
    ->
      log '--- Waiting for answer'
      @command 'wait_for_answer'
    ->
      log '--- Sleep 5s'
      @command 'sleep', 5000
  ]
  outcome.then -> log '--- Client succeeded'
  outcome.fail (reason) -> log "--- Client failed: #{reason}"

.connect 8021, '127.0.0.1'
