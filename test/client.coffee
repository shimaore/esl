esl = require '../lib/esl'
esl.debug = true

# Open connection, send arbitrary API command, disconnect.
fs_command = (cmd,cb) ->
  client = esl.createClient()
  client.on 'esl_auth_request', (req,res) ->
    res.auth 'ClueCon', (req,res) ->
      res.api cmd, (req,res) ->
        res.exit ->
          client.end()
  if cb?
    client.on 'close', cb
  client.connect(8021, '127.0.0.1')

# Example
fs_command "reloadxml"
