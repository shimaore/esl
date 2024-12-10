**This module has been superseded by the [`esl-lite`](https://shimaore.github.io/esl-lite/) module.**

`esl-lite` provides:
- better documentation
- better performance
- automatic reconnection to FreeSwitch
- better LSP integration and safer operations due to precise typing of all operations
- integrated support for `CUSTOM` events
- integrated support for FreeSwitch logging
- updated extensive test suite

`esl-lite` is based on the `esl` module, which was started in 2011 and has served the community well over the years.
`esl-lite` is geared towards supporting large scale deployments for the foreseeable future!

Overview
--------

This module was a promise-based client ('inbound' event socket) and
server ('outbound' event socket) for FreeSwitch, written entirely in Javascript.

The new `esl-lite` module provides only a client ('inbound') API, since the server API does not scale well.

Support
-------

Commercial support is available as well from [the author](https://del.igh.tf/ul/stephane-alnet/).

Migrating to `esl-lite`
-----------------------

If you have been using the `esl` module in client ('inbound') mode, migrating to `esl-lite` is simple.
- No need to manage disconnection/reconnections anymore. The client will reconnect transparently and re-establish event triggers.
- All APIs are now available directly on the client. You explicitly provide the Unique-ID for `uuid` commands. Per-operation timeouts are required.
```ts
const client = new FreeSwitchClient({ logger })
client.on('CHANNEL_CREATE', (msg) => {
  …
  client.command_uuid(msg.body.uniqueId, 'answer', '', 4000).catch( logger.error )
})
await client.bgapi('originate sofia/profile/sip:destination@host &park')
client.custom.on('conference::maintenance', (msg) => { … })
```
- APIs no longer `throw` — inspect the outcome of the commands instead.
```ts
const outcome = await client.bgapi('originate …')
if (outcome instanceof Error) {
  // failed
} else {
  // success
}
```

If you have been using the `esl` module in server ('outbound') mode, migrating to `esl-lite` isn't too difficult either.
- Replace your dialplan with `inline:park` (instead of `inline:'socket:… async full'`).
- Your application should use `FreeSwitchClient` instead of `FreeSwitchServer`.
- Replace `.on( 'connection', … )` with a proper handler for ingress calls.
```ts
client.on('CHANNEL_CREATE', (msg) => {
  if (msg.body.data['Direction'] !== 'inbound') {
    return
  }
  // Your code here
})
```
- All APIS are now available directly on the client. You explicitely provide the Unique-ID for `uuid` commands. Per-operation timeouts are required.
- APIs no longer `throw` — inspect the outcome of the commands instead

Head over to [the online documentation](https://shimaore.github.io/esl-lite/) for additional details.
