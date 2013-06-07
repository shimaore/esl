The value that travels through promises stores both the request data and the response data.

    Request = require './request'

    module.exports = class PromiseValue
      constructor: (@res,@req = new Request()) ->
        @headers = @req.headers
        @body = @req.body

      on: (event) ->
        @res.on event

      send: (command,args) ->
        @res.send command, args

Asynchronously connects to FreeSwitch. The `connect` message is handled by the `Client` class, which then triggers `freeswitch_connect` etc.

      connect: (args...) ->
        @res.socket.connect args...
        @
