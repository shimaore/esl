ESL response and associated API
-------------------------------

    Q = require 'q'
    PromiseValue = require './promise-value'
    Request = require './request'

    module.exports = class Response
      constructor: (@socket) ->

Trigger clean-up events at the end of the connection.

        @socket.on 'freeswitch_disconnect_notice', (res,req) =>
          switch req.headers['Content-Disposition']
            when 'linger'
              @socket.emit 'freeswitch_linger', res
            when 'disconnect'
              @socket.emit 'freeswitch_disconnect', res

Default behavior on disconnect is to end the call.  (However you may capture the `freeswitch_disconnect` event.)

        @socket.on 'freeswitch_disconnect', ->
          @socket.end()

      fail: (e) ->
        @socket.emit 'freeswitch_error', e
        @

Obtain a new promise for this event.

      _on: (event) ->
        deferred = Q.defer()
        @socket.on event, (res,req) ->
          deferred.resolve new PromiseValue res, req
        deferred.promise

Obtain a new promise for this event, cancelling all other listeners.

      on: (event) ->
        deferred = Q.defer()
        @socket.removeAllListeners event

`socket.on` will always give us a new `Response` object; it will always be different from the current `Response` object, although the socket should remain the same.

        @socket.on event, (res,req) =>
          @socket.removeAllListeners event
          deferred.resolve new PromiseValue res, req
        deferred.promise

`send(string,object)` -- send and don't wait for a response.

      send: (command,args) ->
        res = @
        req = new Request()

        deferred = Q.defer()

        try
          @socket.write "#{command}\n"

          if args?
            for key, value of args
              @socket.write "#{key}: #{value}\n"
          @socket.write "\n"

          deferred.resolve new PromiseValue res, req

        catch e
          @fail e
          deferred.reject new Error e

        deferred.promise
