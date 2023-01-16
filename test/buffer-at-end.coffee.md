    import test from 'ava'
    import { FreeSwitchClient } from 'esl'
    import { createServer } from 'node:net'
    import { once } from 'node:events'

    client_port = 5621
    test 'should be empty at end of stream', (t) ->
      spoof = createServer (c) ->
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
      spoof.listen client_port, ->
        t.log 'Server ready'

      client = new FreeSwitchClient { host: '127.0.0.1', port: client_port }
      await client.connect()
      [call] = await once client, 'connect'

      [error] = await once call.socket, 'error'
      t.log "Got error #{error}", error
      t.is error.error, 'Buffer is not empty at end of stream'

      await client.end()
      await spoof.close()

      return
