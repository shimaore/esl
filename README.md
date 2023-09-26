This module is a promise-based client ('inbound' event socket) and
server ('outbound' event socket) for FreeSwitch, written entirely in Javascript
with no dependencies on the libesl library.

This module is actively maintained and used in production systems.

This is version 11, a new major version of `esl`.

Overview
--------

### Client mode

This mode of operation is called "inbound" (to FreeSwitch) in the Event Socket FreeSwitch documentation.
A client can be used to trigger calls asynchronously (for example in a click-to-dial application).
A client can also be used to monitor events for known UUIDs or other fields (see the `.filter(header,value)` method).

### Server mode

A server will handle calls sent to it using the `socket` diaplan application (called "outbound" mode in the [Event Socket Outbound](https://developer.signalwire.com/freeswitch/FreeSWITCH-Explained/Client-and-Developer-Interfaces/Event-Socket-Library/Event-Socket-Outbound_3375460/#diagram) FreeSwitch documentation).
The server is available at a pre-defined port which the `socket` dialplan application will specify.

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

You can connect to an Event Socket server from the FreeSwitch XML dialplan,
Notice the syntax to specify more than one server if desired.

```xml
<action application="set" data="socket_resume=true"/>
<action application="socket" data="127.0.0.1:7000|127.0.0.1:7001 async full"/>
<action application="respond" data="500 socket failure"/>
```

Another option is to configure a inbound profile to directly use the socket.
This bypasses the XML dialplan; instead, an `inline` dialplan is used.

```xml
<profile name="my-sofia-profile">
  <settings>
    <param name="dialplan" value="inline:'socket:127.0.0.1:7000|127.0.0.1:7001 async full'"/>
```

Here is a simplistic event server:

```javascript
import { FreeSwitchServer } from 'esl'

const server = new FreeSwitchServer()

server.on('connection', (call) => {
  const res = await call.command('play-file', 'voicemail/vm-hello')
  const foo = res.body.variable_foo
  await call.hangup() // hang-up the call
  await call.exit()   // tell FreeSwitch we're disconnecting
})

await server.listen({ port: 7000 })
```

Message tracing
---------------

Both `FreeSwitchServer` and `FreeSwitchClient` accept a `logger` option which
must provide `logger.debug`, `logger.info`, and `logger.error`.

If `logger.debug` is not required, it can be set to an no-op function:

```javascript
const logger = {
  debug: () => {},
  info: (...args) => console.info(...args),
  error: (...args) => console.error(...args)
}
```

Install
-------

    npm install esl

Examples and Documentation
--------------------------

The test suite provides many examples.

Support
-------

Please use [GitHub issues](https://github.com/shimaore/esl/issues).

Commercial support is available as well.

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
