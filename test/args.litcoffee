    import test from 'ava'
    import { FreeSwitchResponse } from 'esl'

    socket =
      once: ->
      on: ->
      end: ->
      write: ->
      setKeepAlive: ->
      setNoDelay: ->

    logger = (t) ->
      # debug: (msg,obj) -> t.log msg, obj
      debug: ->
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
          return
        return
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
          return
        return
      t.pass()
      null