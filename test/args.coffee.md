    describe 'api', ->
      Response = require '../src/response'
      it 'should throw properly on closed', (done) ->
        t = new Response on: ->
        t.closed = true
        t
        .api 'foo'
        .catch (error) ->
          done() if error.args.when is 'api on closed socket'

    describe 'bgapi', ->
      Response = require '../src/response'
      it 'should throw properly on closed', (done) ->
        t = new Response on: ->
        t.closed = true
        t
        .bgapi 'foo'
        .catch (error) ->
          done() if error.args.when is 'bgapi on closed socket'
