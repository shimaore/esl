    FS = require '../src/esl'
    pkg = require '../package'
    debug = (require 'debug') "#{pkg.name}:test:reconnect"
    net = require 'net'
    seem = require 'seem'
    sleep = (timeout) -> new Promise (resolve) -> setTimeout resolve, timeout

    describe 'createClient', ->
      client_port = 5624
      it 'should reconnect', (done) ->
        @timeout 30000
        start = (run = 1) ->
          service = (c) ->
            debug "Server run ##{run} received connection"
            c.on 'error', (error) ->
              debug "Server run ##{run} received error #{error}"
              return
            c.on 'data', seem (data) ->
              debug "Server run ##{run} received data", data
              switch run
                when 1
                  debug 'Server run #1 sleeping'
                  yield sleep 500
                  debug 'Server run #1 close'
                  yield c.destroy()
                  yield spoof.close()

                when 2
                  debug 'Server run #2 writing (auth)'
                  yield c.write '''
                    Content-Type: auth/request


                  '''
                  debug 'Server run #2 sleeping'
                  yield sleep 500
                  debug 'Server run #2 writing (reply)'
                  yield c.write '''

                    Content-Type: command/reply
                    Reply-Text: +OK accepted

                    Content-Type: text/disconnect-notice
                    Content-Length: 0

                  '''
                  debug 'Server run #2 sleeping'
                  yield sleep 500
                  debug 'Server run #2 close'
                  yield spoof.close()

                when 3
                  debug 'Server run #3 close'
                  yield spoof.close()
                  done()

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
            run++
            if run < 4
              setTimeout (-> start run+1), 1400
            return
          return

        after ->
          w.end()

        start()

        w = FS.createClient {host:'127.0.0.1',port:client_port}, ->
          debug 'Client is connected'
          @end()

        return
