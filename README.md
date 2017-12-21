This module is a promise-based, chainable, client ('inbound' event socket) and server ('outbound' event socket) for FreeSwitch, written entirely in Javascript with no dependencies on the libesl library.
This module is actively maintained and used in production systems.

[![Build Status](https://travis-ci.org/shimaore/esl.svg?branch=master)](https://travis-ci.org/shimaore/esl)

Client Usage
------------

The following code does the equivalent of `fs_cli -x`: it connects to the Event Socket, runs a single command, then disconnects.

```javascript
FS = require('esl');

var fs_command = function(cmd) {

  var client = FS.client(function(){
    this.api(cmd)
    .then( function(res) {
      // res contains the headers and body of FreeSwitch's response.
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
<action application="set" data="socket_resume=true"/>
<action application="socket" data="127.0.0.1:7000 async full"/>
<action application="respond" data="500 socket failure"/>
```

Here is a simplistic event server:

```javascript
var call_handler = function() {
  this
  .command('play-file', 'voicemail/vm-hello')
  .then(function(res) {
     var foo = res.body.variable_foo;
  })
  .then(function() {
    this.hangup() // hang-up the call
  })
  .then(function() {
    this.exit()   // tell FreeSwitch we're disconnecting
  })
};

require('esl').server(call_handler).listen(7000);
```

Message tracing
---------------

During development it is often useful to be able to see what messages are sent to FreeSwitch or received from FreeSwitch.
This module uses the [debug](https://github.com/visionmedia/debug) module for tracing; simply call your application with

    DEBUG='esl:*'

to see traces.

The names available are `esl:response` and `esl:main`.


Install
-------

    npm install esl

Examples and Documentation
--------------------------

The test suite in [`test/0001.coffee.md`](https://github.com/shimaore/esl/blob/master/test/0001.coffee.md) provides many examples.

The [API](http://shimaore.github.io/esl/) provides a summary of usage.

The methods available inside the call-handler are those of the [response object](https://github.com/shimaore/esl/blob/master/src/response.coffee.md#channel-level-commands): `api`, `bgapi`, `command`, `command_uuid`, etc.

Overview
--------

This module is modelled after Node.js' own httpServer and client, and uses an event-driven interface wrapper inside a promise-based API.

It offers two Event Socket handlers, `client()` and `server()`.

Typically a client would be used to trigger calls asynchronously (for example in a click-to-dial application); this mode of operation is called "inbound" (to FreeSwitch) in the [Event Socket](http://wiki.freeswitch.org/wiki/Event_Socket) FreeSwitch documentation.

A server will handle calls sent to it using the "socket" diaplan application (called "outbound" mode in the [Event Socket Outbound](http://wiki.freeswitch.org/wiki/Event_Socket_Outbound) FreeSwitch documentation).  The server is available at a pre-defined port which the `socket` dialplan application will specify.

Support
-------

Please use [GitHub issues](https://github.com/shimaore/esl/issues).

Client Notes
------------

Note: Use `call.event_json('CHANNEL_HANGUP_COMPLETE','DTMF')` to start receiving event notifications.

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
  this.onceAsync('CHANNEL_ANSWER').then( function () {
    util.log('Call was answered');
  });
  this.onceAsync('CHANNEL_HANGUP').then(  function () {
    util.log('Call hangup');
  });
  this.onceAsync('CHANNEL_HANGUP_COMPLETE').then(  function () {
    util.log('Call was disconnected');
  });
  # However note that `on` cannot use a Promise (since it only would
  # get resolved once).
  this.on('SOME_MESSAGE', function(call) {
    util.log('Got Some Message');
  });
  // Remember to accept the messages since we're using `all_events: false` below.
  this.event_json('CHANNEL_ANSWER','CHANNEL_HANGUP','CHANNEL_HANGUP_COMPLETE','SOME_MESSAGE');
};

var server = esl.server({all_events:false},call_handler)
server.listen(3232);
```

Migrating from earlier versions
-------------------------------

- `once` has been renamed to `onceAsync`; `onceAsync(event)` returns a Promise. `once` is now the regular event-emitter `once(event,callback)`.
- Promises are native Promises, not bluebird's.

Alternative
-----------

The present module should be more convenient if you've already coded for Node.js and are used to promises and events.
If you are coming from the world of FreeSwitch and are used to the Event Socket Library API, you might want to try [node-esl](https://github.com/englercj/node-esl).
