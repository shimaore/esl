```coffeescript
call_handler = require('seem') ->
  caller = @data['Channel-Caller-ID-Number']
  callee = @data['Channel-Destination-Number']
  new_caller = yield db.getAsync "new_caller_for_#{caller}"
  yield @command 'answer'
  yield @command 'play-file', 'voicemail/vm-hello'
  yield @command 'set', "effective_caller_id_number=#{new_caller}"
  yield @command 'bridge', "sofia/egress/#{callee}@example.net"

require('esl').server(call_handler).listen(7000)
```

Load
====

    FS = require('esl')

Server
======

    FS.server(handler,report).listen(port)

The `handler` is required; it is called once for every connection from FreeSwitch (i.e. once for each call). A filter is set up so that the handler only receives events pertaining to the call it handles, and cleanup procedures are automatically called at the end of the connection.

`report(Error)` is called when the handler fails for any reason. This prevents the server from crashing if the handler crashes. It is optional.

The value returned by `FS.server()` is a [net.Server](https://nodejs.org/api/net.html#net_class_net_server), that's why you can (for example) call `.listen()` on it.

Client
======

    FS.client(options,handler,report).connect(port,host)

The only option available is `.password`, which defaults to `ClueCon`. The `options` object is optional.

The `handler` is required; it is called after authentication with FreeSwitch is successful. Cleanup procedures are automatically called at the end of the connection.

`report(Error)` is called when the handler fails for any reason.

The value returned by `FS.client()` is a [net.Socket](https://nodejs.org/api/net.html#net_class_net_socket), that's why you can call `.connect()` on it.

Handler Context
===============

The handler function is called with its context (the `this` object) containing methods and values described in the following sections.

Using FreeSwitch commands
=========================

command(app,args) / command_uuid(uuid,app,args)
-------

Send the application command to FreeSwitch and return a Promise that is only fulfilled once the command completes. For long-running commands such as `bridge` this could be until the call is established.
The Promise is fulfilled with the header and body of the `CHANNEL_EXECUTE_COMPLETE` event from FreeSwitch.

    this.command('bridge','sofia/client/6215@example.net')
    .then(function(res){
       var headers = res.headers;
       var body = res.body;
    })

execute(app,args) / execute_uuid(uuid,app,args)
-------

Send the application command to FreeSwitch and return a Promise that is fulfilled immediately with the header and body of the `command/reply` response from FreeSwitch.

    this.execute('bridge','sofia/client/6215@example.net')
    .then(function(res){
       var headers = res.headers;
       var body = res.body;
    })


Using FreeSwitch API
====================

api
---

Sends an API command and returns a Promise that fulfills with the body of the response. If a UUID is provided in the response it is available as `.uuid`.

    this
      .api('originate sofia/client/sip:7002@example.net &bridge(sofia/client/sip:3000@example.net)'
      .then(function(res){
         var originate_uuid = res.uuid;
       })

bgapi
-----

Send a background API command and returns after the command is completed.

    this
      .bgapi('originate sofia/client/sip:7002@example.net &bridge(sofia/client/sip:3000@example.net)'
      .then(function(res){
         var job_uuid = res.uuid;
       })

Socket
======

socket
------

The original socket (client socket or server's call socket).

end
---

Closes the socket. A shortcut to `this.socket.end()`.

Events
======

on
--

Receives events from the parser.

    this.on('DTMF',function(o) {
      var headers = o.headers;
      var body = o.body;
      var dtmf = o.body['DTMF-Digit']
    }

once
----

Returns a Promise that is fulfilled (once) when the event is received.

    this
      .once('my-event')
      .then(function(data) { ... })

emit
----

Sends an event that can be caught by `on` or `once`.

    this.emit('my-event',some_data)

emit_later
----------

Sends an event that can be caught by `once`, even if the event has not been registered yet.

    this.emit('my-event',some_data)

Low-level
=========

Generic
-------

### sendmsg(cmd,args) / sendmsg_uuid(uuid,cmd,args)

Send a low-level message (server mode)

    this.sendmsg(command,args).then(...)

Send a low-level message (client mode)

    this.sendmsg_uuid(uuid,command,args).then(...)

### hangup(cause) / hangup_uuid(uuid,cause)

Hang-up with the optional `cause`.

This uses the low-level command, and might behave differently from `this.command('hangup')`.

Other
-----

Low-level shortcuts to the corresponding EventSocket commands.

### Events configuration

    this.event_json(events...)
    this.nixevent()
    this.noevents()
    this.filter(header,value)
    this.filter_delete(header,value)
    this.sendevent(name,args)

    this.log()
    this.nolog()

### Connection handling

These are normally called for you, there is no need to use them.

    this.auth(password)
    this.connect()
    this.linger()
    this.exit()