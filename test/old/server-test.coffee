FS = require '../lib/esl'
Q = require 'q'

log = -> console.log arguments...

FS.client (call) ->
  log '--- Client started'
  uuid = null
  outcome = call.sequence [
    ->
      log '--- Creating new instance'
      @trace "client: "
      @debug on
      @api 'originate loopback/app=park &park()'
    ->
      uuid = @body.match(/^\+OK ([0-9a-f-]+)/)[1]
      @command_uuid uuid, 'set', 'socket_resume=true'
    ->
      log '--- Connecting to server'
      @command_uuid uuid, 'socket', '127.0.0.1:7000 async full'
    ->
      @exit()
  ]
  outcome.then ->
    log '--- Client succeeded'
    process.exit(0)
  outcome.fail (reason) ->
    log "--- Client failed: #{reason}"
    process.exit(1)
  log '--- Client ready'

.connect 8021, '127.0.0.1'
