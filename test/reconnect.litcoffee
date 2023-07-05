    import test from 'ava'
    import { FreeSwitchClient } from 'esl'
    import { createServer } from 'node:net'
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout; return

    client_port = 5623
    test 'should reconnect', (t) ->
      t.timeout 30000

      start = ->
        run = 0
        service = (c) ->
          run++
          t.log "Server run ##{run} received connection"
          c.on 'error', (error) ->
            t.log "Server run ##{run} received error #{error}"
            return
          c.on 'data', (data) ->
            t.log "Server run ##{run} received data", data
            switch run
              when 1
                t.log 'Server run #1 sleeping'
                await sleep 500
                t.log 'Server run #1 close'
                await c.destroy()

              when 2
                t.log 'Server run #2 writing (auth)'
                await c.write '''
                  Content-Type: auth/request


                '''
                t.log 'Server run #2 sleeping'
                await sleep 500
                t.log 'Server run #2 writing (reply)'
                await c.write '''

                  Content-Type: command/reply
                  Reply-Text: +OK accepted

                  Content-Type: text/disconnect-notice
                  Content-Length: 0

                '''
                t.log 'Server run #2 sleeping'
                await sleep 500
                t.log 'Server run #2 end'
                await c.end()

              when 3
                t.log 'Server run #3 end'
                try await client.end()
                await c.end()
                t.log 'Server run #3 close'
                await spoof.close()
                t.pass()

            return

          c.resume()
          c.write '''
            Content-Type: auth/request


          '''
          return

        spoof = createServer service
        spoof.listen client_port, ->
          t.log "Server ready"
        spoof.on 'close', ->
          t.log "Server received close event"
        return

      start()
      client = new FreeSwitchClient host:'127.0.0.1', port:client_port
      client.on 'error', (error) ->
        t.log 'client error', error
      await client.connect()
      await sleep 20000
