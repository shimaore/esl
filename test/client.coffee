FS = require '../lib/esl'
Q = require 'q'

log = -> console.log arguments...

assert = require 'assert'

fs_command = (cmd) ->
  FS.client (call) ->
    log '--- Client starts'
    assert.equal call.headers['Reply-Text'], '+OK accepted'
    outcome = call.sequence [
      -> @api(cmd)
      ->
        assert @body.match /\+OK \[Success\]/
        @
      -> @exit()
      # -> Q.delay(1000).done @exit()
    ]
    outcome.then -> log '--- Client succeeded'
    outcome.fail (reason) -> log "--- Client failed: #{reason}"
    log '--- Client ready'
  .connect(8021, '127.0.0.1')

fs_command "reloadxml"
