    import test from 'ava'
    import { FreeSwitchResponse } from '../build/response.mjs'

    socket =
      once: ->
      on: ->
      end: ->
      write: ->

    logger = (t) ->
      debug: (msg,obj) -> t.log msg, obj
      info: (msg,obj) -> t.log msg, obj
      error: (msg,obj) -> t.log msg, obj

    test 'should throw properly on closed (api)', (t) ->
      await new Promise (resolve) ->
        T = new FreeSwitchResponse socket, logger t
        T.closed = true
        T
        .api 'foo'
        .catch (error) ->
          t.log error
          resolve() if error.args.when is 'api on closed socket'
      t.pass()
      null

    test 'should throw properly on closed (bgapi)', (t) ->
      await new Promise (resolve) ->
        T = new FreeSwitchResponse socket, logger t
        T.closed = true
        T
        .bgapi 'foo'
        .catch (error) ->
          t.log error
          resolve() if error.args.when is 'bgapi on closed socket'
      t.pass()
      null
