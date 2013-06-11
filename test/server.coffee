FS = require '../lib/esl'
Q = require 'q'
log = -> console.log arguments...

FS.server (call) ->
  log '--- New server connection'
  outcome = call.sequence [
    -> Q.delay(1000).done @command 'answer'
    -> Q.delay(1000).done @command 'hangup'
  ]
  outcome.then -> log '--- Server succeeded'
  outcome.fail (reason) -> log "--- Server failed: #{reason}"
.listen 7000
log '--- Server waiting for connection'
