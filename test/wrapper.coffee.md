    FS = require '../src/esl'
    pkg = require '../package'
    debug = (require 'debug') "#{pkg.name}:test:reconnect"
    net = require 'net'
    seem = require 'seem'
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
            c.on 'data', seem (data) ->
              data = data.toString 'utf-8'
              debug "Server run ##{run} received data", data
              yield sleep 100
              debug "Server run ##{run} writing (reply ok)"
              c.write '''

                Content-Type: command/reply
                Reply-Text: +OK accepted


              '''
              if data.match /bridge[^]*foo/
                yield sleep 100
                debug "Server run ##{run} writing (execute-complete for bridge)"
                c.write '''

                  Content-Type: text/event-plain
                  Content-Length: 78

                  Event-Name: CHANNEL_EXECUTE_COMPLETE
                  Application: bridge
                  Application-Data: foo


                '''
              if data.match /ping[^]*bar/
                yield sleep 100
                debug "Server run ##{run} writing (execute-complete for ping)"
                c.write '''

                  Content-Type: text/event-plain
                  Content-Length: 76

                  Event-Name: CHANNEL_EXECUTE_COMPLETE
                  Application: ping
                  Application-Data: bar


                '''
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
        w.on 'connect', seem ->
          debug 'Client is connected'
          yield @command 'bridge', 'foo'
          debug 'Client sending again'
          yield @command 'ping', 'bar'
          debug 'Client requesting end'
          yield @end()
          done()

        return
