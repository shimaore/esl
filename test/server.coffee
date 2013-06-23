FS = require '../lib/esl'
Q = require 'q'
log = -> console.log arguments...

delay = ->
  Q.delay 500
  @

server = FS.server (call) ->
  log '--- New server connection'
  call.trace 'server: '
  outcome = call.sequence [
    delay
    -> @command 'answer'
    delay
    -> @command 'hangup'
  ]
  outcome.then -> log '--- Server succeeded'
  outcome.fail (reason) -> log "--- Server failed: #{reason}"

  call.socket.on 'close', ->
    # Only run the server once
    log '--- Stopping the server.'
    server.close ->
      log '--- Server is stopped.'

server.listen 7000
log '--- Server waiting for connection'
