FS = require '../lib/esl'

log = -> console.log arguments...

assert = require 'assert'

fs_command = (cmd) ->
  FS.client (call) ->
    log 'Client started'
    assert.equal call.headers['Reply-Text'], '+OK accepted'
    outcome = call.sequence [
      -> @api(cmd)
      ->
        assert @body.match /\+OK \[Success\]/
        @
      -> @exit()
    ]
    outcome.then -> log 'Client succeeded'
    outcome.fail (reason) -> log "Client failed: #{reason}"
    outcome.fin -> call.end()
  .connect(8021, '127.0.0.1')

fs_command "reloadxml"
