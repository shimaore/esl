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
      T = new FreeSwitchResponse socket, logger t
      T.closed = true
      await T
        .api 'foo'
        .catch (error) ->
          t.log error
          t.is error.args.when, 'api on closed socket'
      return

    test 'should throw properly on closed (bgapi)', (t) ->
      T = new FreeSwitchResponse socket, logger t
      T.closed = true
      await T
        .bgapi 'foo'
        .catch (error) ->
          t.log error
          t.is error.args.when, 'bgapi on closed socket'
      return
