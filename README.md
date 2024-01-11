This module is a promise-based client ('inbound' event socket) and
server ('outbound' event socket) for FreeSwitch, written entirely in Javascript
with no dependencies on the libesl library.

This module is actively maintained and used in production systems.

This is version 11, a new major version of `esl`.
It introduces TypeScript support, and gets rid of binding to `this`.

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
import { FreeSwitchClient, once } from 'esl'

const client = new FreeSwitchClient({
  port: 8021
})

const fs_command = async (cmd) => {
  const p = once(client,'connect')
  await client.connect()
  const [ call ] = await p
  const res = await call.api(cmd)
  await call.exit();
  await client.end();
}

fs_command("reloadxml");
```

Generally speaking though, the client might reconnect multiple times, and your
code should handle reconnections:

```javascript
import { FreeSwitchClient, once } from 'esl'

const client = new FreeSwitchClient({
  port: 8021
})

client.on('connect', (call) => {
  // Do something here with the API
})
```

### Constructor options

The `FreeSwitchClient` constructor takes a single argument, an options object
with the following fields:

- `host`: defaults to `127.0.0.1`
- `port`: defaults to 8021
- `password`: defaults to `ClueCon`
- `logger`: defaults to the `console` object

### Methods

The `FreeSwitchClient` class has the following methods.

#### `connect()`

This method triggers the connection to FreeSWITCH.

The client will automatically reconnect if FreeSWITCH crashes or the connection
is lost.

#### async `end()`

This methods closes the connection to FreeSWITCH and prevents further attempts.

Returns a Promise.

### Events

The `FreeSwitchClient` class may emit the following events.

#### `error` (error)

Sent when an error is reported.

#### `connect` (current_call : FreeSwitchResponse)

Sent when connecting to FreeSWITCH. Might be sent multiple times in case
disconnections happen.

#### `reconnecting` (retry: number)

Sent when disconnected from FreeSWITCH. The `retry` value indicates how long the
client will wait until reconnecting to FreeSWITCH.

#### `warning` (data)

Sent by the underlying socket when a socket-level warning is triggered.

#### `end`

Sent when the `end()` method is called.


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
  const res = await call.command('playback', 'voicemail/vm-hello')
  const foo = res.body.variable_foo
  await call.hangup() // hang-up the call
  await call.exit()   // tell FreeSwitch we're disconnecting
})

await server.listen({ port: 7000 })
```

### Constructor options

The `FreeSwitchServer` constructor takes a single argument, an options object
with the following fields:

- `all_events`: boolean, defaults to `true`; indicates whether the
  FreeSwitchResponse object should request all events from FreeSWITCH (the
  default), or only the ones required to process commands (all_events:false).
  Note that the default will negatively impact performance of both FreeSWITCH
  and your application; it however provides the simplest onboarding.

- `my_events`: boolean, defaults to `true`; indicates whether the
  FreeSwitchResponse object should filter on the Unique-ID of the call.
  This is generally what one wants, there is generally no reason to set this to
  `false`. (If you want to monitor system-wide events you should probably use a
  FreeSwitchClient instance.)

- `logger`: defaults to the `console` object

### Methods

The `FreeSwitchClient` class has the following methods.

#### async `listen(options)`

This method starts accepting connection from FreeSWITCH.

The options are the same as for `server.listen` in the Node.js `net` package:
`port`, `host`, `backlog`, …

Returns a Promise.

#### async `close()`

This methods closes the connection to FreeSWITCH and prevents further attempts.

Returns a Promise.

#### async `getConnectionCount()`

This method returns a Promise for the number of currently opened connections.

```
const count = await server.getConnectionCount()
console.log(`There are ${count} connections left opened.)
```

### Events

The `FreeSwitchServer` class may emit the following events.

#### `error` (error)

Sent when an error is reported.

#### `drop` (data)

Sent when an incoming connection is dropped.

#### `connection` (call : FreeSwitchResponse, { headers, body, data, uuid })

Sent when FreeSWITCH connects to Node.js.

This event receives two parameters:
- the first one is a FreeSwitchResponse instance you will use to process the call;
- the second one contains data received during the initial connection.

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

FreeSwitchResponse
------------------

The `FreeSwitchResponse` class is the one you will interact most. It allows you
to interact with FreeSWITCH using both low-level (Event Socket) commands and
higher-level (API) commands.

The `FreeSwitchResponse` class extends EventEmitter.

### Methods

#### `ref() : string`

Returns the unique identifier used internally to reference this instance.

#### async `bgapi(command: string, timeout?: number ) : Promise<{ body: StringMap }>`

Send a `bgapi` (background API) command to FreeSwitch and wait for completion.
Different FreeSWITCH modules provide different commands, consult the documentation
of each module to know which commands it provides. Inside the FreeSWITCH CLI use
`show api` and `show application` to get the list of registered commands.

`bgapi` will wait until the commands completes before returning its Promise.
This migh be multiple hours if the command initiates a call.

The `timeout` parameter has no default. If a timeout is not provided, the
Promise might never get fulfilled.

Might thow `FreeSwitchError`.

#### async `api(command: string, timeout?: number) : Promise<{ uuid: string, body: StringMap, headers: StringMap }>`

Send an `api` command to FreeSwitch.
Different FreeSWITCH modules provide different commands, consult the documentation
of each module to know which commands it provides. Inside the FreeSWITCH CLI use
`show api` and `show application` to get the list of registered commands.

Returns a Promise that is fulfilled as soon as FreeSwitch sends a reply.
Requests are queued and each request is matched with the first-coming response,
since there is no way to match between requests and responses.

On the FreeSWITCH side, `api` command block the Event Socket until they respond.
This is probably not what you want if using `FreeSwitchClient`, you should use
`bgapi` in that case.

Also use `bgapi` if you need to make sure responses are matched properly, since
it provides the proper semantics.

The timeout defaults to the value of `.default_send_timeout()`, i.e. 10s.

Might thow `FreeSwitchError`.

#### `command(app_name:string,app_arg:string) : SendResult`
#### `command_uuid(uuid:string,app_name:string,app_arg:string,timeout?:number) : SendResult`

These methods are identical; you would typically use `command` in a
FreeSwitchServer application, and `command_uuid` in a FreeSwitchClient
application.

Execute a dialplan application synchronously — returns a Promise that completes
when the command is completed (which may take hours).

```
// Send the command and wait for completion
await call.command('playback', '/tmp/example.wav')
```

#### `execute(app_name:string,app_arg:string) : SendResult`
#### `execute_uuid(uuid:string,app_name:string,app_arg:string,loops?:number,event_uuid?:string) : SendResult`

These methods are identical; you would typically use `execute` in a
FreeSwitchServer application, and `execute_uuid` in a FreeSwitchClient
application.

Execute a dialplan application asynchronously — does not wait for completion.

In most cases you probably want to use `command` or `command_uuid` instead of
`execute` and `execute_uuid`.

```
// Send the command
await call.execute('playback', '/tmp/example.wav')
```

#### `hangup(hangup_cause?:string) : SendResult`
#### `hangup_uuid(uuid:string,hangup_cause?:string) : SendResult`

These methods are identical; you would typically use `hangup` in a
FreeSwitchServer application, and `hangup_uuid` in a FreeSwitchClient
application.

Hangs up the call.

#### `unicast(args: {'local-ip':string, 'local-port':number, 'remote-ip':string, 'remote-port':number, transport:'tcp'|'udp', flags?:'native'}) : SendResult`
#### `unicast_uuid(uuid:string,args:{'local-ip':string, 'local-port':number, 'remote-ip':string, 'remote-port':number, transport:'tcp'|'udp', flags?:'native'}) : SendResult`

These methods are identical; you would typically use `unicast` in a
FreeSwitchServer application, and `unicast_uuid` in a FreeSwitchClient
application.

Interface media with the specified IP and port.

- `local-ip`: default to 127.0.0.1
- `local-port`: default to 8025
- `remote-ip`: default to 127.0.0.1
- `remote-port`: default to 8026
- flags: `native` — do not transcode audio to/from the FreeSWITCH internal format (L16)

### Methods for low-level interface

#### `event_json(...events:string[]) : SendResult`

Add the specified events to the list of events forwarded to Node.js.

By default this module already executes
`call.event_json('CHANNEL_EXECUTE_COMPLETE', 'BACKGROUND_JOB')`, or, with the
`all_events` flag of FreeSwitchServer, `call.event_json('ALL')`.

```javascript
call.event_json('CHANNEL_HANGUP_COMPLETE','DTMF')
```

#### `nixevent(...events:string[]) : SendResult`

Remove the specified events from the list of events forwarded to Node.js.

Removing `CHANNEL_EXECUTE_COMPLETE` and `BACKGROUND_JOB` will break
`command`/`command_uuid` and `bgapi`, respectively.

#### `noevents() : SendResult`

Stop receiving events.

Using this method will prevent `command`/`command_uuid` and `bgapi` from
working.

#### `filter(header:string, value:string) : SendResult`

Add an event filter for the specified event header and value.

#### `filter_delete(header:string, value:string) : SendResult`

Remove an event filter for the specified event header and value.

#### `sendevent(event_name:string, args:StringMap) : SendResult`

Enqueue an event in the FreeSWITCH event queue.

Requires the `full` flag when sending to FreeSwitchServer.

#### `linger() : SendResult`

Used in server mode, requests FreeSwitch to not close the socket as soon as the
call is over, allowing us to do some post-processing on the call (mainly,
receiving call termination events).

By default, `FreeSwitchServer` with call `exit()` for you after 4 seconds.
You must capture the `cleanup_linger` event if you want to handle things differently.

#### `log(level:number) : SendResult`

Enable logging on the socket, optionally setting the log level.

#### `nolog() : SendResult`

Disable logging.

#### `sendmsg(command:string,args:StringMap) : SendResult`
#### `sendmsg_uuid(uuid:string,command:string,args:StringMap) : SendResult`

Send a message on the socket.

The command is one of the low-level `call-command` documented for the Event
Socket interface.

In most cases you should use one of the provided methods (`api`, `bgapi`, etc.) rather than try to implement this.

#### `send(command: string, args?: StringMap, timeout?: number ) : SendResult`

Write a command to the Event Socket and wait for the (low-level) reply.

In most cases you should use one of the provided methods (`api`, `bgapi`, etc.) rather than try to implement this.

### Events

The `FreeSwitchResponse` class may emit different events.

#### FreeSWITCH events

By default in FreeSwitchServer, `all_events` is `true` and your code will
receive the different events for the call.

You might also activate additional events in FreeSwitchClient using
the `event_json()` method.

The event callback will receive a single argument, an object with two fields:
- `headers`: the headers of the Event Socket event
- `body`: the content sent by FreeSWITCH

Both are `Object`.

```javascript
import { FreeSwitchServer } from 'esl'

const server = new FreeSwitchServer()

server.on('connection', (call) => {
  // Only triggered once. `onceAsync` returns a Promise and might throw.
  call.onceAsync('CHANNEL_ANSWER').then( function ({headers,body}) {
    console.log('Call was answered');
  });
  // Might be triggered multiple times.
  call.on('CHANNEL_ANSWER', function({headers,body}) {
    console.log('Call was answered');
  });
  // By default `all_events` is true and we do not need to use `event_json`.
})

await server.listen({ port: 7000 })
```

#### 'socket.close'

Emitted when the underlying network socket is closed.

#### 'socket.error' (err:Error)

Emitted when the unerlying network socket has an error.

#### 'socket.write' (err:Error)

Emitted when a write on the underlying network socket has an error.

#### 'socket.end' (err:Error)

Emitted when the underlying socket was terminated due to an error.

#### 'error.missing-content-type' (err:FreeSwitchMissingContentTypeError)

Emitted when FreeSWITCH did not provide a Content-Type header.

Should normally not happen, most probably a bug in FreeSWITCH if this happens.

#### 'error.unhandled-content-type' (err:FreeSwitchUnhandledContentTypeError)

Emitted when the parser received an unsupported Content-Type header from FreeSWITCH.

Should normally not happen, report these as bug!

#### 'error.invalid-json' (err:Error)

Emitted when the JSON received from FreeSWITCH could not be parsed.

### 'error.missing-event-name' (err:FreeSwitchMissingEventNameError)

Emitted when the FreeSWITCH response could be parsed but no Event-Name is found.

#### 'cleanup_linger'

Emitted when you activated `.linger()` and it's time for your code to call
`.exit()`.

#### 'freeswitch_log_data' (data:{ headers: StringMap, body: string })

Emitted when you activated `.log()` and a log event is received.

#### 'freeswitch_disconnect_notice'

Emitted by FreeSWITCH to indicate imminent disconnection of the socket.

#### 'freeswitch_rude_rejection'

Undocumented rejection from FreeSWITCH.


Install
-------

Add the module to your project using `npm`, `yarn`, `pnpm`.

    npm install esl

Examples
--------

The test suite provides many examples.

Support
-------

Please use [GitHub issues](https://github.com/shimaore/esl/issues) for community support.

Commercial support is available as well from [the maintainer](https://del.igh.tf/ul/stephane-alnet/).

Migrating from earlier versions
-------------------------------

- creating client and server now uses `new` and the `FreeSwitchClient`,
  `FreeSwitchServer` classes
- `this` is no longer used; the `call` object is passed as a parameter.
