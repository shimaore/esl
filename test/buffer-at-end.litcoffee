    import test from 'ava'
    import { FreeSwitchClient } from 'esl'
    import { createServer } from 'node:net'
    import { once } from 'node:events'

    client_port = 5621
    test 'should be empty at end of stream', (t) ->
      try
        spoof = createServer keepAlive: true
        spoof.on 'connection', (c) ->
          c.write '''
            Content-Type: auth/request


          '''
          c.on 'data', ->
            await new Promise (resolve) -> setTimeout resolve, 250
            c.write '''

              Content-Type: command/reply
              Reply-Text: +OK accepted

              Content-Type: text/disconnect-notice
              Content-Length: 3

              Disconnected, filling your buffer with junk.

            '''
            spoof.close()
          return
        spoof.on 'listening', ->
          t.log 'Server ready'
        spoof.listen port: client_port

        client = new FreeSwitchClient { host: '127.0.0.1', port: client_port }
        pCall = once client, 'connect'
        pExpect = once client, 'warning'
        client.connect()
        t.log 'buffer-at-end: called connect'

        [call] = await pCall
        t.log 'buffer-at-end: got call', { ref: call.ref(), uuid: call.uuid() }

        await new Promise (resolve) -> setTimeout resolve, 200

        [error] = await pExpect
        t.log "buffer-at-end: got error #{error}", error
        t.is error.error, 'Buffer is not empty at end of stream'

        await client.end()
        await spoof.close()
      catch error
        t.log "buffer-at-end: unexpected failure", error

      return
