Chainable Client and server for FreeSwitch events socket

Note: this README documents the upcoming 1.0 release, which supports a chainable API.

Install
-------

    npm install esl

Overview
--------

This module is modeled after Node.js' own httpServer and client.

It offers two Event Socket connection types, `client()` and `server()`.

Typically a client would be used to trigger calls asynchronously (for example in a click-to-dial application); this mode of operation is called *inbound* (to FreeSwitch) in the [Event Socket](http://wiki.freeswitch.org/wiki/Event_Socket) FreeSwitch documentation.

A server will handle calls sent to it using the `socket` diaplan application (called *outbound* mode in the [Event Socket Outbound](http://wiki.freeswitch.org/wiki/Event_Socket_Outbound) FreeSwitch documentation).  The server you create is available at a pre-defined port which the `socket` dialplan application will specify.

You will use one mode or the other depending on what your application needs to do.

Usage
-----

    var FS = require('fs-q');

Client Example
--------------

The following code does the equivalent of `fs_cli -x`: it connects to the Event Socket, runs a single command, then disconnects.

    var FS = require('fs-q');

    var fs_command = function (cmd) {
      var client = FS.client();

      // Manage the client using the chainable API.
      client
      .connect(8021, '127.0.0.1')
      .on('freeswitch_connect')
      .then FS.api(cmd)       // execute the command
      .then FS.exit()         // send the `exit` command to FreeSwitch
      .then FS.disconnect();  // cleanly disconnects from FreeSwitch
    };

    // Example: execute `reloadxml`.
    fs_command("reloadxml");

Note: Use `handler.event_json 'HEARTBEAT'` to start receiving event notifications.

CallServer Example
------------------

From the FreeSwitch dialplan, use

    <action application="socket" data="127.0.0.1:7000 async full"/>

to hand the call over to an Event Socket server on the local host on port 7000.

Typically a server will send commands to FreeSwitch, wait for completion, send a new command, etc.

    var FS = require('fs-q');

    var call_handler = function(pv) {
      pv
      .then FS.command('play-file', 'voicemail/vm-hello')
      .then( function (pv) {
        var foo = pv.body.variable_foo;
        if(foo) {
          return pv.then FS.command('play-file', 'digits/1');
        }
        return pv;
      })
      // Asynchronous call to a database, a website, etc.
      .then( function(pv) {
        request('http://127.0.0.1/some/value',function(data){
          if(data) {
            // Wait for the command to complete on FreeSwitch.
            pv
            .command('play-file',data);
          }
        });
        return pv;
      });

    };

    var server = FS.server(call_handler);
    server.listen(7000);

For some applications you might want to capture channel events instead of using the `command()` / callback pattern:

    var FS = require('fs-q');

    var call_handler = function(pv) {
      var uri = req.body.variable_sip_req_uri;
      pv.on('CHANNEL_ANSWER', function(pv) {
          util.log('Call was answered');
      });
      pv.on('CHANNEL_HANGUP_COMPLETE', function(pv) {
          util.log('Call was disconnected');
      });
    };

    var server = FS.server(call_handler);
    server.listen(7000);

More Examples
-------------

* See under examples/ in the source for contributed examples.

Alternative
-----------

The present module should be more convenient if you've already coded for Node.js and are used to the `EventEmitter` pattern.
If you are coming from the world of FreeSwitch and are used to the Event Socket Library API, you might want to try [node-esl](https://github.com/englercj/node-esl).
