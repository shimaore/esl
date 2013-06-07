Client and server for FreeSwitch events socket that follow Node.js conventions

Install
-------

    npm install esl

Overview
--------

This module is modelled after Node.js' own httpServer and client.

It offers two Event Socket handlers, `createClient()` and `createCallServer()`.

Typically a client would be used to trigger calls asynchronously (for example in a click-to-dial application); this mode of operation is called "inbound" (to FreeSwitch) in the [Event Socket](http://wiki.freeswitch.org/wiki/Event_Socket) FreeSwitch documentation.

A server will handle calls sent to it using the "socket" diaplan application (called "outbound" mode in the [Event Socket Outbound](http://wiki.freeswitch.org/wiki/Event_Socket_Outbound) FreeSwitch documentation).  The server is available at a pre-defined port which the `socket` dialplan application will specify.

Support
-------

Mailing list: <carrierclass@googlegroups.com>
Subscribe: <https://groups.google.com/d/forum/carrierclass>

Usage
-----

    esl = require 'esl'

The library is a plain Node.js module so you can also call it from Javascript. All examples are given using CoffeeScript for simplicity but will work as plain Javascript.

Client Example
--------------

The following code does the equivalent of `fs_cli -x`: it connects to the Event Socket, runs a single command, then disconnects.

    esl = require 'esl'

    fs_command = (cmd,cb) ->
      # Open connection.
      client = esl.createClient()
      client.on 'esl_auth_request', (call) ->
        call.auth 'ClueCon', ->
          # Send arbitrary API command.
          call.api cmd, ->
            # Disconnect.
            call.exit ->
              # Stops the client.
              client.end()
      if cb?
        client.on 'close', cb
      client.connect(8021, '127.0.0.1')

    # Example
    fs_command "reloadxml"

Note: Use `call.event_json 'HEARTBEAT'` to start receiving event notifications.

CallServer Example
------------------

From the FreeSwitch dialplan, use `<action application="socket" data="127.0.0.1:7000 async full"/>` to hand the call over to an Event Socket server.

If you'd like to get realtime channel variables after each `command()`, execute the `verbose_events` command first:

    server = esl.createCallServer()

    server.on 'CONNECT', (call) ->
      # "verbose_events" will send us channel data after each "command".
      call.command 'verbose_events', (call) ->
        # command() will wait for the command to finish.
        call.command 'play-file', 'voicemail/vm-hello', (call) ->
          # You may now access realtime variables from call.body
          foo = call.body.variable_foo

    server.listen 7000

For some applications you might want to capture channel events instead of using the `command()` / callback pattern:

    server = esl.createCallServer()

    server.on 'CONNECT', (call) ->
      uri = call.body.variable_sip_req_uri

      # These are called asynchronously.
      call.on 'CHANNEL_ANSWER', (call) ->
        util.log 'Call was answered'
      call.on 'CHANNEL_HANGUP_COMPLETE', (call) ->
        util.log 'Call was disconnected'

    # Start the ESL server on port 7000.
    server.listen 7000

More Examples
-------------

* Client example: [send commands](https://github.com/shimaore/ccnq3/blob/master/applications/freeswitch/agents/freeswitch.coffee)
* Server example: [voicemail application](https://github.com/shimaore/ccnq3/tree/master/applications/voicemail/node/)
* Also see under examples/ in the source for contributed examples.

Alternative
-----------

This module should be more convenient if you've already coded for Node.js and are used to its [`http` interface](http://nodejs.org/api/http.html) and the `EventEmitter` pattern.
If you are coming from the world of FreeSwitch and are used to the Event Socket Library API, you might want to try [node-esl](https://github.com/englercj/node-esl).
