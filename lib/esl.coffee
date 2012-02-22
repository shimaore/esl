# esl is a client and a server library for FreeSwitch's ESL protocol
# (c) 2010 Stephane Alnet
# Released under the AGPL3 license
#

#### Overview
# esl is modelled after Node.js' own httpServer and client.
# It offers two low-level ESL handlers, createClient() and
# createServer(), and a higher-level CallServer class.
#
# For more information about ESL consult the FreeSwitch wiki
# [Event Socket](http://wiki.freeswitch.org/wiki/Event_Socket)
#
# Typically a client would be used to trigger calls asynchronously
# (for example in a click-to-dial application); this mode of operation is
# called "inbound" (to FreeSwitch) in the FreeSwitch documentation.
#
# A server will handle calls sent to it using the "socket" diaplan
# application (called "outbound" mode in the FreeSwitch documentation).
# The server is available at a pre-defined port which
# the socket application will specify. See
# [Event Socket Outbound](http://wiki.freeswitch.org/wiki/Event_Socket_Outbound)

#### Usage
#
#     esl = require 'esl'
#
# (The library is a plain Node.js module so you can also call
# it from Javascript. All examples are given using CoffeeScript
# for simplicity.)

net         = require 'net'
querystring = require 'querystring'
util        = require 'util'
assert      = require 'assert'

# If you ever need to debug esl, set
#
#     esl.debug = true
#

exports.debug = false

#### Client Example
# The following code does the equivalent of "fs_cli -x".
#
#     esl = require 'esl'
#
#     # Open connection, send arbitrary API command, disconnect.
#     fs_command = (cmd,cb) ->
#       client = esl.createClient()
#       client.on 'esl_auth_request', (call) ->
#         call.auth 'ClueCon', ->
#           call.api cmd, ->
#             call.exit ->
#               client.end()
#       if cb?
#         client.on 'close', cb
#       client.connect(8021, '127.0.0.1')
#
#     # Example
#     fs_command "reloadxml"
#
#  Note: Use
#
#     call.event_json 'HEARTBEAT'
#
#  to start receiving event notifications.

#### CallServer Example
#
# From the dialplan, use
#    <action application="socket" data="127.0.0.1:7000 async full"/>
# to hand the call over to an ESL server.
#
# If you'd like to get realtime channel variables and synchronous commands, do
#
#     server = esl.createCallServer()
#
#     server.on 'CONNECT', (call) ->
#       # "verbose_events" will send us channel data after each "command".
#       call.command 'verbose_events', ->
#         # You may now access realtime variables from @body
#         foo = this.body.variable_foo
#         # Wait for the command to finish.
#         call.command 'play-file', 'voicemail/vm-hello'
#
#     server.listen 7000
#
# The asynchronous version of "command" is "execute".
#
# An asynchronous server will look this way:
#
#     server = esl.createServer()
#
#     server.on 'CONNECT', (call) ->
#       uri = call.body.variable_sip_req_uri
#
#       # Other FreeSwitch channel events are available as well:
#       call.on 'CHANNEL_ANSWER', (call) ->
#         util.log 'Call was answered'
#       call.on 'CHANNEL_HANGUP_COMPLETE', (call) ->
#         util.log 'Call was disconnected'
#
#     # Start the ESL server on port 7000.
#     server.listen 7000
#

#### Headers parser
# ESL framing contains headers and a body.
# The header must be decoded first to learn
# the presence and length of the body.

parse_header_text = (header_text) ->
  if exports.debug
    util.log "parse_header_text(#{header_text})"

  header_lines = header_text.split("\n")
  headers = {}
  for line in header_lines
    do (line) ->
      [name,value] = line.split /: /, 2
      headers[name] = value

  # Decode headers: in the case of the "connect" command,
  # the headers are all URI-encoded.
  if headers['Reply-Text']?[0] is '%'
    for name of headers
      headers[name] = querystring.unescape(headers[name])

  return headers

#### ESL stream parser
# The ESL parser will parse an incoming ESL stream, whether
# your code is acting as a client (connected to the FreeSwitch
# ESL server) or as a server (called back by FreeSwitch due to the
# "socket" application command).
class eslParser
  constructor: (@socket) ->
    @body_length = 0
    @buffer = ""

  # When capturing the body, buffer contains the current data
  # (text), and body_length contains how many bytes are expected to
  # be read in the body.
  capture_body: (data) ->
    @buffer += data

    # As long as the whole body hasn't been received, keep
    # adding the new data into the buffer.
    if @buffer.length < @body_length
      return

    # Consume the body once it has been fully received.
    body = @buffer.substring(0,@body_length)
    @buffer = @buffer.substring(@body_length)
    @body_length = 0

    # Process the content
    @process @headers, body
    @headers = {}

    # Re-parse whatever data was left after the body was
    # fully consumed.
    @capture_headers ''

  # Capture headers, meaning up to the first blank line.
  capture_headers: (data) ->
    @buffer += data

    # Wait until we reach the end of the header.
    header_end = @buffer.indexOf("\n\n")
    if header_end < 0
      return

    # Consume the headers
    header_text = @buffer.substring(0,header_end)
    @buffer = @buffer.substring(header_end+2)

    # Parse the header lines
    @headers = parse_header_text(header_text)

    # Figure out whether a body is expected
    if @headers["Content-Length"]
      @body_length = @headers["Content-Length"]
      # Parse the body (and eventually process)
      @capture_body ''

    else
      # Process the (header-only) content
      @process @headers
      @headers = {}

      # Re-parse whatever data was left after these headers
      # were fully consumed.
      @capture_headers ''

  # Dispatch incoming data into the header or body parsers.
  on_data: (data) ->
    if exports.debug
      util.log "on_data(#{data})"

    # Capture the body as needed
    if @body_length > 0
      return @capture_body data
    else
      return @capture_headers data

  # For completeness provide an on_end() method.
  # TODO: it probably should make sure the buffer is empty?
  on_end: () ->
    if exports.debug
      util.log "Parser: end of stream"
      if @buffer.length > 0
        util.log "Buffer is not empty, left over: #{@buffer}"

#### ESL response and associated API
class eslResponse
  constructor: (@socket,@headers,@body) ->

  register_callback: (event,cb) ->
    @socket.on event, (res) =>
      @socket.removeAllListeners event
      cb res

  # A generic way of sending commands to FreeSwitch.
  #
  #      send (string,array,function(){})
  #
  # This is normally not used directly.
  # The array and callback are both optional.

  send: (command,args,cb) ->

    # The arguments parameter is optional.
    if typeof args is 'function' and not cb?
      [cb,args] = [args,null]

    if exports.debug
      util.log util.inspect command: command, args: args

    if cb? then @register_callback 'esl_command_reply', cb

    # Send the command out.
    try
      @socket.write "#{command}\n"
      if args?
        for key, value of args
          @socket.write "#{key}: #{value}\n"
      @socket.write "\n"
    catch e
      @socket.emit 'esl_error', error:e

  on: (event,listener) -> @socket.on(event,listener)

  end: () -> @socket.end()

  #### Channel-level commands

  # Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands)
  api: (command,cb) ->
    @register_callback 'esl_api_response', cb
    @send "api #{command}"

  # Send an API command in the background.
  # The callback will receive the Job UUID (instead of the usual response).
  bgapi: (command,cb) ->
    @register_callback 'esl_command_reply', (res) ->
      r = res.header['Reply-Text']?.match /\+OK Job-UUID: (.+)$/
      cb? r[1]
    @send "bgapi #{command}"

  #### Event reception and filtering

  # Request that the server send us events in JSON format.
  # (For all useful purposes this is the only supported format
  # in this module.)
  # For example:
  #
  #     res.event_json 'HEARTBEAT'
  #
  event_json: (events...,cb) ->
    @send "event json #{events.join(' ')}", cb

  # Remove the given event types from the events ACL.
  nixevent: (events...,cb) ->
    @send "nixevent #{events.join(' ')}", cb

  # Remove all events types.
  noevents: (cb) ->
    @send "noevents", cb

  # Generic event filtering
  filter: (header,value,cb) ->
    @send "filter #{header} #{value}", cb

  filter_delete: (header,value,cb) ->
    if value?
      @send "filter #{header} #{value}", cb
    else
      @send "filter #{header}", cb

  # Send an event into the FreeSwitch event queue.
  sendevent: (event_name,args,cb) ->
    @send "sendevent #{event_name}", args, cb

  # Authenticate, typically used in a client:
  #
  #     client = esl.createClient()
  #     client.on 'esl_auth_request', ->
  #       @auth 'ClueCon', ->
  #         # Start sending other commands here.
  #     client.connect ...
  #
  auth: (password,cb)       -> @send "auth #{password}", cb

  # connect() and linger() are used in server mode.
  connect: (cb)             -> @send "connect", cb    # Outbound mode

  linger: (cb)              -> @send "linger", cb     # Outbound mode

  # Send the exit command to the FreeSwitch socket.
  exit: (cb)                -> @send "exit", cb

  #### Event logging commands
  log: (level,cb) ->
    [level,cb] = [null,level] if typeof(level) is 'function'
    if level?
      @send "log #{level}", cb
    else
      @send "log", cb

  nolog: (cb)                 -> @send "nolog", cb

  #### Message sending
  # Send Message (to a UUID)

  sendmsg_uuid: (uuid,command,args,cb) ->
    options = args ? {}
    options['call-command'] = command
    execute_text = if uuid? then "sendmsg #{uuid}" else 'sendmsg'
    @send execute_text, options, cb

  # Same, assuming server/outbound ESL mode:

  sendmsg: (command,args,cb) -> @sendmsg_uuid null, command, args, cb

  #### Client-mode ("inbound") commands
  # The target UUID must be specified.

  # Execute an application for the given UUID (in client mode)

  execute_uuid: (uuid,app_name,app_arg,cb) ->
    options =
      'execute-app-name': app_name
      'execute-app-arg':  app_arg
    @sendmsg_uuid uuid, 'execute', options, cb

  # Execute an application synchronously.
  # The callback is only called when the command has completed.
  command_uuid: (uuid,app_name,app_arg,cb) ->
    if cb?
      @socket.on "CHANNEL_EXECUTE_COMPLETE #{app_name} #{app_arg}", cb
    @execute_uuid uuid,app_name,app_arg

  # Hangup a call

  hangup_uuid: (uuid,hangup_cause,cb) ->
    hangup_cause ?= 'NORMAL_UNSPECIFIED'
    options =
      'hangup-cause': hangup_cause
    @sendmsg_uuid uuid, 'hangup', options, cb

  unicast_uuid: (uuid,args,cb) ->
    @sendmsg_uuid uuid, 'unicast', args, cb

  # nomedia_uuid: TODO

  #### Server-mode commands
  # The target UUID is our (own) call UUID.

  # Execute an application for the current UUID (in server/outbound mode)

  execute: (app_name,app_arg,cb)  -> @execute_uuid null, app_name, app_arg, cb
  command: (app_name,app_arg,cb)  -> @command_uuid null, app_name, app_arg, cb

  hangup: (hangup_cause,cb)       -> @hangup_uuid  null, hangup_cause, cb

  unicast: (args,cb)              -> @unicast_uuid null, args, cb

  # nomedia: TODO

  # Clean-up at the end of the connection.
  auto_cleanup: ->
    @on 'esl_disconnect_notice', ->
      if exports.debug
        util.log "Received ESL disconnection notice"
      switch @headers['Content-Disposition']
        when 'linger'      then @exit()
        when 'disconnect'  then @end()

#### Connection Listener (socket events handler)
# This is modelled after Node.js' http.js

connectionListener= (socket) ->

  socket.setEncoding('ascii')
  parser = new eslParser socket
  socket.on 'data', (data) ->  parser.on_data(data)
  socket.on 'end',  ()     ->  parser.on_end()

  # Make the command responses somewhat unique.
  socket.on 'CHANNEL_EXECUTE_COMPLETE', (res) ->
    application = @body['Application']
    application_data = @body['Application-Data']
    socket.emit "#{event_name} #{application} #{application_data}", res

  parser.process = (headers,body) ->
    if exports.debug
      util.log util.inspect headers: headers, body: body

    # Rewrite headers as needed to work around some weirdnesses in
    # the protocol;
    # and assign unified event IDs to the ESL Content-Types.

    switch headers['Content-Type']

      when 'auth/request'
        event = 'esl_auth_request'

      when 'command/reply'
        event = 'esl_command_reply'
        # Apparently a bug in the response to "connect"
        if headers['Event-Name'] is 'CHANNEL_DATA'
          body = headers
          headers = {}
          for n in ['Content-Type','Reply-Text','Socket-Mode','Control']
            headers[n] = body[n]
            delete body[n]

      when 'text/event-json'
        try
          body = JSON.parse(body)
        catch error
          util.log "JSON #{error} in #{body}"
          return
        event = body['Event-Name']

      when 'text/event-plain'
        body = parse_header_text(body)
        event = body['Event-Name']

      when 'log/data'
        event = 'esl_log_data'

      when 'text/disconnect-notice'
        event = 'esl_disconnect_notice'

      when 'api/response'
        event = 'esl_api_response'

      else
        event = headers['Content-Type']

    res = new eslResponse socket,headers,body
    if exports.debug
      util.log util.inspect event:event, res:res
    socket.emit event, res

  # Get things started
  socket.emit 'esl_connect', new eslResponse socket

#### ESL Server


class eslServer extends net.Server
  constructor: (requestListener) ->
    @on 'connection', (socket) ->
      socket.on 'esl_connect', requestListener
      connectionListener socket

    super()

# The callback will receive an eslResponse object.
exports.createServer = (requestListener) -> return new eslServer(requestListener)

exports.createCallServer = ->
  server = new eslServer (call) ->
    Unique_ID = 'Unique-ID'
    call.connect (call) ->
      unique_id = call.body[Unique_ID]
      call.auto_cleanup()
      call.filter Unique_ID, unique_id, ->
        call.event_json 'ALL', ->
          server.emit 'CONNECT', call
  return server

#### ESL client
class eslClient extends net.Socket
  constructor: () ->
    @on 'connect', ->
      connectionListener @

    super()

exports.createClient = -> return new eslClient()
