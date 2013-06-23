FS = require '../lib/esl'

log = -> console.log arguments...

FS.client (call) ->
  log '--- Client started'
  uuid = null
  outcome = call.sequence [
    ->
      @trace "client: "
      log '--- Creating new instance'
      @api 'originate loopback/app=park &park()'
    ->
      uuid = @body.match(/^\+OK ([0-9a-f-]+)/)[1]
      return
    ->
      log '--- Connecting to server'
      @command_uuid uuid, 'socket', '127.0.0.1:7000 async full'
  ]
  outcome.then ->
    log '--- Client succeeded'
    process.exit(0)
  outcome.fail (reason) ->
    log "--- Client failed: #{reason}"
    process.exit(1)
  log '--- Client ready'

.connect 8021, '127.0.0.1'
