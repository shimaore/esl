    FS = require '../src/esl'
    debug = (require 'debug') 'buffer-at-end'
    net = require 'net'

    describe 'The buffer', ->
      client_port = 5621
      it 'should be empty at end of stream', (done) ->
        spoof = net.createServer (c) ->
          c.write '''
            Content-Type: auth/request


          '''
          c.on 'data', ->
            c.write '''

              Content-Type: command/reply
              Reply-Text: +OK accepted

              Content-Type: text/disconnect-notice
              Content-Length: 3

              Disconnected, filling your buffer with junk.

            '''
        client = FS.client ->
          client.end()
        client.on 'error', (error) ->
          debug "Got error #{error}", error
          if error.error is 'Buffer is not empty at end of stream'
            done()
        spoof.listen client_port, ->
          debug 'Server ready'

        client.connect client_port, '127.0.0.1'
