This module is a promise-based, chainable, client ('inbound' event socket) and server ('outbound' event socket) for FreeSwitch, written entirely in Javascript with no dependencies on the libesl library.
This module is actively maintained and used in production systems.

This is a beta release of version 11, a new major version of `esl`.

Client Usage
------------

The following code does the equivalent of `fs_cli -x`: it connects to the Event Socket, runs a single command, then disconnects.

```javascript
import { FreeSwitchClient } from 'esl'
import { once } from 'node:events'

const client = new FreeSwitchClient({
  port: 8021
})

const fs_command = async (cmd) => {
  const p = once(client,'connect')
  await client.connect()
  const [ call ] = await p
  const res = await call.api(cmd)
  // res.body.should.match(/\+OK/);
  await call.exit();
  client.end();
}

fs_command("reloadxml");
```

Generally speaking though, the client might reconnect multiple times, and your
code should handle reconnections:

```javascript
import { FreeSwitchClient } from 'esl'
import { once } from 'node:events'

const client = new FreeSwitchClient({
  port: 8021
})

client.on('connect', (call) => {
  // Do something here with the API
})
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
import { FreeSwitchServer } from 'esl'

const server = new FreeSwitchServer()

await server.list({ port: 7000 })
server.on('connection', (call) => {
  res = await call.command('play-file', 'voicemail/vm-hello')
  var foo = res.body.variable_foo;
  await call.hangup() // hang-up the call
  await call.exit()   // tell FreeSwitch we're disconnecting
})
```

Message tracing
---------------

During development it is often useful to be able to see what messages are sent to FreeSwitch or received from FreeSwitch.
This module uses the [debug](https://github.com/visionmedia/debug) module for tracing; simply call your application with

    DEBUG='esl:*,-esl:*:trace'

to see traces.

The names available are `esl:response` and `esl:main`.


Install
-------

    npm install esl

Examples and Documentation
--------------------------

The test suite provides many examples.

Overview
--------

A client would be used to trigger calls asynchronously (for example in a click-to-dial application); this mode of operation is called "inbound" (to FreeSwitch) in the [Event Socket](http://wiki.freeswitch.org/wiki/Event_Socket) FreeSwitch documentation.

A server will handle calls sent to it using the "socket" diaplan application (called "outbound" mode in the [Event Socket Outbound](http://wiki.freeswitch.org/wiki/Event_Socket_Outbound) FreeSwitch documentation).  The server is available at a pre-defined port which the `socket` dialplan application will specify.

Support
-------

Please use [GitHub issues](https://github.com/shimaore/esl/issues).

Client Notes
------------

Use `call.event_json('CHANNEL_HANGUP_COMPLETE','DTMF')` to start receiving event notifications.

(In server mode this is automatically done by the module.)

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

- creating client and server now uses `new` and the `FreeSwitchClient`,
  `FreeSwitchServer` classes
- `this` is no longer used; the `call` object is passed as a parameter.

Alternative
-----------

The present module should be more convenient if you've already coded for Node.js and are used to promises and events.
If you are coming from the world of FreeSwitch and are used to the Event Socket Library API, you might want to try [node-esl](https://github.com/englercj/node-esl).
