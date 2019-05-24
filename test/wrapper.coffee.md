    FS = require '..'
    pkg = require '../package'
    debug = (require 'debug') "#{pkg.name}:test:reconnect"
    net = require 'net'
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout

    describe 'createClient', ->
      client_port = 5624
      it 'should send commands', (done) ->
        @timeout 30000
        spoof = null
        start = (run = 1) ->
          connection = 0
          service = (c) ->
            debug "Server run ##{run} received #{++connection} connection"
            debug "Server run ##{run} writing (auth)"
            c.on 'error', (error) ->
              debug "Server run ##{run} received error #{error}"
              return
            c.on 'data', (data) ->
              data = data.toString 'utf-8'
              debug "Server run ##{run} received data", data
              await sleep 100
              debug "Server run ##{run} writing (reply ok)"
              c.write '''
                Content-Type: command/reply
                Reply-Text: +OK accepted


              '''
              if data.match /bridge[^]*foo/
                await sleep 100
                debug "Server run ##{run} writing (execute-complete for bridge)"
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
                debug "Server run ##{run} writing (execute-complete for ping)"
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
              debug "Server run ##{run} end"

            c.resume()
            c.write '''

              Content-Type: auth/request


            '''
            return

          spoof = net.createServer service
          spoof.listen client_port, ->
            debug "Server run ##{run} ready"
          spoof.on 'close', ->
            debug 'Server received close event'
            return
          return

        after ->
          w.end()
          spoof.close()

        start()

        w = FS.createClient {host:'127.0.0.1',port:client_port}
        w.on 'connect', ->
          debug 'Client is connected'
          await @command 'bridge', 'foo'
          debug 'Client sending again'
          await @command 'ping', 'bar'
          debug 'Client requesting end'
          await @end()
          done()

        return
