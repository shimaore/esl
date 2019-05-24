    describe 'api', ->
      Response = require '../lib/response'
      it 'should throw properly on closed', (done) ->
        t = new Response
          on: ->
          once: ->
        t.closed = true
        t
        .api 'foo'
        .catch (error) ->
          done() if error.args.when is 'api on closed socket'
        null

    describe 'bgapi', ->
      Response = require '../lib/response'
      it 'should throw properly on closed', (done) ->
        t = new Response
          on: ->
          once: ->
        t.closed = true
        t
        .bgapi 'foo'
        .catch (error) ->
          done() if error.args.when is 'bgapi on closed socket'
        null
