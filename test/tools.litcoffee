Sleep the given amount of milliseconds

    export sleep = (timeout) -> new Promise (resolve) ->
      setTimeout resolve, timeout
      return

    export second = 1000

    export timer = ->
      now = process.hrtime.bigint()
      ->
        Number(process.hrtime.bigint() - now) / 1_000_000
