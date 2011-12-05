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

#### Headers parser
# ESL framing contains headers and a body.
# The header must be decoded first to learn
# the presence and length of the body.

parse_header_text = (header_text) ->
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
    @body_left = 0
    @buffer = ""

  # When capturing the body, buffer contains the current data
  # (text), and body_left contains how many bytes are left to
  # be read in the body.
  capture_body: (data) ->
    # As long as the whole body hasn't been received, keep
    # adding the new data into the buffer.
    if data.length < @body_left
      @buffer    += data
      @body_left -= data.length
      return

    # Consume the body once it has been fully received.
    body = @buffer + data.substring(0,@body_left)
    extra = data.substring(@body_left)
    @body_left = 0
    @buffer = ""

    # Process the content
    @process @headers, body
    @headers = {}

    # Re-parse whatever data was left after the body was
    # fully consumed.
    @capture_headers extra

  # Capture headers, meaning up to the first blank line.
  capture_headers: (data) ->
    header_end = data.indexOf("\n\n")

    # Wait until we reach the end of the header.
    if header_end < 0
      @buffer += data
      return

    # Consume the headers
    header_text = @buffer + data.substring(0,header_end)
    extra = data.substring(header_end+2)
    @buffer = ""

    # Parse the header lines
    @headers = parse_header_text(header_text)

    # Figure out whether a body is expected
    if @headers["Content-Length"]
      @body_left = @headers["Content-Length"]
      # Re-parse (and eventually process)
      @capture_body extra

    else
      # Process the (header-only) content
      @process @headers
      @headers = {}

      # Re-parse whatever data was left after the headers
      # were fully consumed.
      @capture_headers extra

  # Dispatch incoming data into the header or body parsers.
  on_data: (data) ->

    # Capture the body as needed
    if @body_left > 0
      return @capture_body data
    else
      return @capture_headers data

  # For completeness provide an on_end() method.
  # TODO: it probably should make sure the buffer is empty?
  on_end: () ->

#### ESL request
class eslRequest
  constructor: (@headers,@body) ->

#### ESL response and associated API
class eslResponse
  constructor: (@socket) ->

  # A generic way of sending commands back to FreeSwitch.
  #
  #      send (string,hash,function(req,res))
  #
  # is normally not used directly.

  send: (command,args,cb) ->
      # Make sure we are the only one receiving command replies
      @socket.removeAllListeners('esl_command_reply')
      @socket.removeAllListeners('esl_api_response')
      # Register the callback for the proper event types.
      if cb?
        @socket.on 'esl_command_reply', (req,res) ->
          cb(req,res)
        @socket.on 'esl_api_response', (req,res) ->
          cb(req,res)

      # Send the command out.
      @socket.write "#{command}\n"
      if args?
        for key, value of args
          @socket.write "#{key}: #{value}\n"
      @socket.write "\n"

  on: (event,listener) -> @socket.on(event,listener)

  end: () -> @socket.end()

  #### Channel-level commands

  # Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands)
  api: (command,cb) ->
    @send "api #{command}", null, cb

  # Send an API command in the background.
  # The callback will receive the Job UUID (instead of the usual request/response pair).
  bgapi: (command,cb) ->
    @send "bgapi #{command}", null, (req,res) ->
      if cb?
        r = res.header['Reply-Text']?.match /\+OK Job-UUID: (.+)$/
        cb r[1]

  #### Event reception and filtering

  # Request that the server send us events in JSON format.
  # (For all useful purposes this is the only supported format
  # in this module.)
  # For example:
  #
  #     res.event_json 'HEARTBEAT'
  #
  event_json: (events...,cb) ->
    @send "event json #{events.join(' ')}", null, cb

  # Remove the given event types from the events ACL.
  nixevent: (events...,cb) ->
    @send "nixevent #{events.join(' ')}", null, cb

  # Remove all events types.
  noevents: (cb) ->
    @send "noevents", null, cb

  # Generic event filtering
  filter: (header,value,cb) ->
    @send "filter #{header} #{value}", null, cb

  filter_delete: (header,value,cb) ->
    if value?
      @send "filter #{header} #{value}", null, cb
    else
      @send "filter #{header}", null, cb

  # Send an event into the FreeSwitch event queue.
  sendevent: (event_name,args,cb) ->
    @send "sendevent #{event_name}", args, cb

  # Authenticate, typically used in a client:
  #
  #     client = esl.createClient()
  #     client.on 'esl_auth_request', (req,res) ->
  #       res.auth 'ClueCon', (req,res) ->
  #         # Start sending other commands here.
  #     client.connect ...
  #
  auth: (password,cb)       -> @send "auth #{password}", null, cb

  # connect() and linger() are used in server mode.
  connect: (cb)             -> @send "connect", null, cb    # Outbound mode

  linger: (cb)              -> @send "linger", null, cb     # Outbound mode

  # Send the exit command to the FreeSwitch socket.
  exit: (cb)                -> @send "exit", null, cb

  #### Event logging commands
  log: (level,cb) ->
    [level,cb] = [null,level] if typeof(level) is 'function'
    if level?
      @send "log #{level}", null, cb
    else
      @send "log", null, cb

  nolog: (cb)                 -> @send "nolog", null, cb

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

  hangup: (hangup_cause,cb)       -> @hangup_uuid  null, hangup_cause, cb

  unicast: (args,cb)              -> @unicast_uuid null, args, cb

  # nomedia: TODO

#### Connection Listener (socket events handler)
# This is modelled after Node.js' http.js

connectionListener= (socket) ->
  socket.setEncoding('ascii')
  parser = new eslParser socket
  socket.on 'data', (data) ->  parser.on_data(data)
  socket.on 'end',  ()     ->  parser.on_end()
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
        event = 'esl_event'
      when 'text/event-plain'
        body = parse_header_text(body)
        event = 'esl_event'
      when 'log/data'
        event = 'esl_log_data'
      when 'text/disconnect-notice'
        event = 'esl_disconnect_notice'
      when 'api/response'
        event = 'esl_api_response'
      else
        event = headers['Content-Type']
    # Build request and response and send them out.
    req = new eslRequest headers,body
    res = new eslResponse socket
    socket.emit event, req, res
  # Get things started
  @emit 'esl_connect', new eslResponse socket if @emit?

#### ESL Server

class eslServer extends net.Server
  constructor: (requestListener) ->
    @on 'esl_connect', requestListener
    @on 'connection', connectionListener
    super()

# You can use createServer(callback) from your code.
exports.createServer = (requestListener) -> return new eslServer(requestListener)

#### ESL client
class eslClient extends net.Socket
  constructor: () ->
    @on 'connect', () -> connectionListener(this)
    super()

exports.createClient = () -> return new eslClient()


# Examples:
###

  esl = require 'esl'

  # Open connection, send arbitrary API command, disconnect.
  fs_command = (cmd,cb) ->
    client = esl.createClient()
    client.on 'esl_auth_request', (req,res) ->
      res.auth 'ClueCon', (req,res) ->
        res.api cmd, (req,res) ->
          res.exit ->
            client.end()
    if cb?
      client.on 'close', cb
    client.connect(8021, '127.0.0.1')

  # Example
  fs_command "reloadxml"

  # Note: Use
  #    res.send 'event json HEARTBEAT'
  # to start receiving event notifications.

###

