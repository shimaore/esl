Promise-aware client and server for FreeSwitch events socket.

This file documents the new version 1.0.x of the package which is under development.

The old API is still available in the 0.3.1 package version. It uses `createClient` and `createCallServer` instead of `client` and `server`, so that there is no ambiguity which version you expect / are using.

Client Usage
------------

The following code does the equivalent of `fs_cli -x`: it connects to the Event Socket, runs a single command, then disconnects.

    var fs_command = function(cmd) {

      var call_manager = function(call) {
        call
        .api(cmd)                 // send the command
        .then(function(call) {
          return call.exit();     // tell FreeSwitch we're disconnecting
        })
        .then(function(call) {
          return call.end();      // close the socket
        })
      };

      require('esl').client(call_manager).connect(8021, '127.0.0.1');
    };

    fs_command("reloadxml");

Alternatively you can send multiple commands using the `sequence` method:

    var fs_command = function(cmd) {

      var call_manager = function(call) {

        var outcome = call.sequence([
          function(){ this.api(cmd) }
        , function(){ this.exit()   }
        ]);

        outcome.fin( function(){ call.end() });
      };

      require('esl').client(call_manager).connect(8021, '127.0.0.1');
    };

    fs_command("reloadxml");

The methods return [Q promises](http://documentup.com/kriskowal/q/). If the `then` calls do not return a value, the proper object is substituted.

The last example as CoffeeScript:

    fs_command = (cmd) ->
      call_manager = (call) ->

        outcome = call.sequence [
          -> @api cmd
          -> @exit()
        ]
        outcome.fin -> call.end()

      require('esl')
      .client(call_manager)
      .connect 8021, '127.0.0.1'

    fs_command 'reloadxml'


Install
-------

    npm install esl

Overview
--------

This module is modelled after Node.js' own httpServer and client, with the addition of a promise-based API.

It offers two Event Socket handlers, `client()` and `server()`.

Typically a client would be used to trigger calls asynchronously (for example in a click-to-dial application); this mode of operation is called "inbound" (to FreeSwitch) in the [Event Socket](http://wiki.freeswitch.org/wiki/Event_Socket) FreeSwitch documentation.

A server will handle calls sent to it using the "socket" diaplan application (called "outbound" mode in the [Event Socket Outbound](http://wiki.freeswitch.org/wiki/Event_Socket_Outbound) FreeSwitch documentation).  The server is available at a pre-defined port which the `socket` dialplan application will specify.

Support
-------

Mailing list: <carrierclass@googlegroups.com>
Subscribe: <https://groups.google.com/d/forum/carrierclass>

Client Notes
--------------

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
