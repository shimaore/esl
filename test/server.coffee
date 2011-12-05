# Incomplete test
# Verify either with
#     nc localhost 7000
# or by connecting from a real server using the "socket" application.
port = 7000

esl = require '../lib/esl.coffee'
esl.debug = true

server = esl.createCallServer()

server.on 'CONNECT', (req,res) ->
  util.log 'CONNECT received'
  res.emit 'force_disconnect'

server.listen port
