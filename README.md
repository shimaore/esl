Promise-aware client and server for FreeSwitch events socket.

This file documents the new, promise-based API of the package, version 1.x, which is under development.

The old, callback-based API is still available in the 0.3 packages. It uses `createClient` and `createCallServer` instead of `client` and `server`, so that there is no ambiguity which version you expect / are using. If your existing code uses the old API make sure that your `package.json` contains

    "esl": "~0.3.2"

Client Usage
------------

The following code does the equivalent of `fs_cli -x`: it connects to the Event Socket, runs a single command, then disconnects.

    var fs_command = function(cmd) {

      var call_manager = function(call) {

        var outcome = call.sequence([
          function(){ this.api(cmd) }
        , function(){ this.exit()   }
        ]);

      };

      require('esl').client(call_manager).connect(8021, '127.0.0.1');
    };

    fs_command("reloadxml");

`call.sequence` is a shorthand for the longer version:

    var fs_command = function(cmd) {

      var call_manager = function(call) {
        call
        .api(cmd)                 // send the command
        .then(function(call) {
          return call.exit();     // tell FreeSwitch we're disconnecting
        })
      };

      require('esl').client(call_manager).connect(8021, '127.0.0.1');
    };

    fs_command("reloadxml");

The API methods return [Q promises](http://documentup.com/kriskowal/q/). If you are not using `call.sequence` make sure you return a promise for the `call` object at the end of your callbacks.

If you need to collect data back from an API call:

        var outcome = call.sequence([
          function(){ this.api(cmd) }
          function(){ console.log("API said: "+this.body) }
        ]);

The original example as CoffeeScript:

    fs_command = (cmd) ->
      call_manager = (call) ->

        outcome = call.sequence [
          -> @api cmd
          -> @exit()
        ]

      require('esl')
      .client(call_manager)
      .connect 8021, '127.0.0.1'

    fs_command 'reloadxml'

Server Usage
------------

From the FreeSwitch XML dialplan, you can connect to an Event Socket server using for example:

    <action application="socket" data="127.0.0.1:7000 async full"/>

Here is a simplistic event server:

    var call_handler = function(call) {
      call
      .command('play-file', 'voicemail/vm-hello')
      .then(function(call) {
         var foo = call.body.variable_foo;
      })
      .hangup() // hang-up the call
      .exit()   // tell FreeSwitch we're disconnecting
    };

    require('esl').server(call_handler).listen(7000);

Message tracing
---------------

During development it is often useful to be able to see what messages are sent to FreeSwitch or received from FreeSwitch.

    call.trace(true)

will start a default tracing logger, while

    call.trace(false)

will stop it. Also

    call.trace("my prefix")

will print out the specified string each time.

You may also provide your own tracing function instead of `true`; it will receive an object containing either `command` and `args` when sending messages to FreeSwitch, or `headers` and `body` when receiving messages from FreeSwitch.

Note: the `headers` and `body` are the ones you might see inside your call-handling functions. They may differ from on-wire headers and body; use `FS.debug = true` to trace those.

Install
-------

For the new, promise-based API:

    npm install esl@1.0

For the old, callback-based API:

    npm install esl@0.3

Overview
--------

This module is modelled after Node.js' own httpServer and client, and uses an event-driven interface wrapper inside a promise-based API.

It offers two Event Socket handlers, `client()` and `server()`.

Typically a client would be used to trigger calls asynchronously (for example in a click-to-dial application); this mode of operation is called "inbound" (to FreeSwitch) in the [Event Socket](http://wiki.freeswitch.org/wiki/Event_Socket) FreeSwitch documentation.

A server will handle calls sent to it using the "socket" diaplan application (called "outbound" mode in the [Event Socket Outbound](http://wiki.freeswitch.org/wiki/Event_Socket_Outbound) FreeSwitch documentation).  The server is available at a pre-defined port which the `socket` dialplan application will specify.

Support
-------

Mailing list: <carrierclass@googlegroups.com>
Subscribe: <https://groups.google.com/d/forum/carrierclass>

Client Notes
------------

Note: Use `call.event_json 'HEARTBEAT'` to start receiving event notifications.

Server Notes
------------

For some applications you might want to capture channel events instead of using the `command()` / callback pattern:

    var call_handler = function(call) {
      var uri = call.body.variable_sip_req_uri

      # These are called asynchronously.
      call
      .once('CHANNEL_ANSWER', function(call) {
        util.log('Call was answered');
      })
      .once('CHANNEL_HANGUP_COMPLETE', function(call) {
        util.log('Call was disconnected');
      }
    };

Alternative
-----------

The present module should be more convenient if you've already coded for Node.js and are used to its [`http` interface](http://nodejs.org/api/http.html) and the `EventEmitter` pattern.
If you are coming from the world of FreeSwitch and are used to the Event Socket Library API, you might want to try [node-esl](https://github.com/englercj/node-esl).
