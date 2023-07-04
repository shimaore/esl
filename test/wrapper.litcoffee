    import test from 'ava'
    import { FreeSwitchClient } from 'esl'
    import { createServer } from 'node:net'
    import { once } from 'node:events'
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout

    client_port = 5624
    test 'should send commands', (t) ->
      t.timeout 30000

      connection = 0
      service = (c) ->
        t.log "Server received #{++connection} connection"
        c.on 'error', (error) ->
          t.log "Server received error #{error}"
          return
        c.on 'data', (data) ->
          data = data.toString 'utf-8'
          t.log "Server received data", data
          await sleep 100
          t.log "Server writing (reply ok)"
          c.write '''
            Content-Type: command/reply
            Reply-Text: +OK accepted


          '''
          if data.match /bridge[^]*foo/
            await sleep 100
            t.log "Server writing (execute-complete for bridge)"
            event_uuid = data.match(/Event-UUID: (\S+)/)[1]
            msg = """
              Content-Type: text/event-plain
              Content-Length: #{97+event_uuid.length}

              Event-Name: CHANNEL_EXECUTE_COMPLETE
              Application: bridge
              Application-Data: foo
              Application-UUID: #{event_uuid}


            """
            c.write msg
          if data.match /ping[^]*bar/
            await sleep 100
            t.log "Server writing (execute-complete for ping)"
            event_uuid = data.match(/Event-UUID: (\S+)/)[1]
            msg = """

              Content-Type: text/event-plain
              Content-Length: #{95+event_uuid.length}

              Event-Name: CHANNEL_EXECUTE_COMPLETE
              Application: ping
              Application-Data: bar
              Application-UUID: #{event_uuid}


            """
            c.write msg
        c.on 'end', ->
          t.log "Server end"

        c.resume()
        t.log "Server writing (auth)"
        c.write '''

          Content-Type: auth/request


        '''
        return

      spoof = createServer service
      spoof.listen client_port, ->
        t.log "Server ready"
      spoof.on 'close', ->
        t.log 'Server received close event'
        return

      w = new FreeSwitchClient {host:'127.0.0.1',port:client_port}
      t.log 'Awaiting connect'
      await w.connect()
      t.log 'Awaiting FreeSwitchResponse object'
      [call] = await once w, 'connect'
      t.log 'Client is connected'
      await call.command 'bridge', 'foo'
      t.log 'Client sending again'
      await call.command 'ping', 'bar'
      t.log 'Client requesting end'
      await call.end()

      await w.end()
      await spoof.close()
      t.pass()
      return
