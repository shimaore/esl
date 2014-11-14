[![GratiPay](https://img.shields.io/gratipay/shimaore.svg)](https://gratipay.com/shimaore/)

ESL 2.x is a promise-based client ('inbound' event socket) and server ('outbound' event socket) for FreeSwitch, written entirely in Javascript with no dependencies on the libesl library.
This module is actively maintained and used in production systems.

Client Usage
------------

The following code does the equivalent of `fs_cli -x`: it connects to the Event Socket, runs a single command, then disconnects.

```javascript
FS = require('esl');

var fs_command = function(cmd) {

  var client = FS.client(function(){
    this.api(cmd)
    .then( function(res) {
      // res basically contains the headers and body of FreeSwitch's response.
      res.body.should.match(/\+OK/);
    })
    .then( function(){
      this.exit();
    })
    .then( function(){
      client.end();
    })
  });
  client.connect(8021,'127.0.0.1');

};

fs_command("reloadxml");
```

The API methods return [promises](https://github.com/petkaantonov/bluebird/blob/master/API.md).

The original example as CoffeeScript:

```coffeescript
FS = require 'esl'

fs_command = (cmd) ->

  client = FS.client ->
    @api cmd
    .then -> @exit()
    .then -> client.end()

  client.connect 8021, '127.0.0.1'

fs_command 'reloadxml'
```

Server Usage
------------

From the FreeSwitch XML dialplan, you can connect to an Event Socket server using for example:

```xml
<action application="socket" data="127.0.0.1:7000 async full"/>
```

Here is a simplistic event server:

```javascript
var call_handler = function() {
  this
  .command('play-file', 'voicemail/vm-hello')
  .then(function(res) {
     var foo = res.body.variable_foo;
  })
  .hangup() // hang-up the call
  .exit()   // tell FreeSwitch we're disconnecting
};

require('esl').server(call_handler).listen(7000);
```

Message tracing
---------------

During development it is often useful to be able to see what messages are sent to FreeSwitch or received from FreeSwitch.

```javascript
call.trace(true)
```

will start a default tracing logger, while

```javascript
call.trace(false)
```

will stop it. Also

```javascript
call.trace("my prefix")
```

will print out the specified prefix each time.

Install
-------

    npm install esl

Examples
--------

The tests in [`test/0001.coffee.md`](https://github.com/shimaore/esl/blob/master/test/0001.coffee.md) provide many examples.

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

```javascript
var esl = require('esl'),
    util = require('util');

var call_handler = function() {

  # for debugging
  this.trace(true);

  # These are called asynchronously.
  this.once('CHANNEL_ANSWER').then( function () {
    util.log('Call was answered');
  });
  this.once('CHANNEL_HANGUP').then(  function () {
    util.log('Call hangup');
  });
  this.once('CHANNEL_HANGUP_COMPLETE').then(  function () {
    util.log('Call was disconnected');
  });
  # However note that `on` cannot use a Promise (since it only would
  # get resolved once).
  this.on('SOME_MESSAGE', function(call) {
    util.log('Got Some Message');
  });
};

var server = esl.server(call_handler)
server.listen(3232);
```

Alternative
-----------

The present module should be more convenient if you've already coded for Node.js and are used to promises and events.
If you are coming from the world of FreeSwitch and are used to the Event Socket Library API, you might want to try [node-esl](https://github.com/englercj/node-esl).
