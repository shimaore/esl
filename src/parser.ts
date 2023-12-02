// Event Socket stream parser
// ==========================
var FreeSwitchParserError;

import querystring from 'node:querystring';

FreeSwitchParserError = class FreeSwitchParserError extends Error {
  constructor(error, buffer) {
    super(JSON.stringify({error, buffer}));
    this.error = error;
    this.buffer = buffer;
    return;
  }

};

export var FreeSwitchParser = class FreeSwitchParser {
  // The Event Socket parser will parse an incoming ES stream, whether your code is acting as a client (connected to the FreeSwitch ES server) or as a server (called back by FreeSwitch due to the "socket" application command).
  constructor(socket, process) {
    this.process = process;
    this.body_length = 0;
    this.buffer = Buffer.alloc(0);
    this.buffer_length = 0;
    // ### Dispatch incoming data into the header or body parsers.

    // Capture the body as needed
    socket.on('data', (data) => {
      if (this.body_length > 0) {
        this.capture_body(data);
      } else {
        this.capture_headers(data);
      }
    });
    // For completeness provide an `on_end()` method.
    socket.once('end', () => {
      if (this.buffer_length > 0) {
        socket.emit('warning', new FreeSwitchParserError('Buffer is not empty at end of stream', this.buffer));
      }
    });
    return;
  }

  // ### Capture body
  capture_body(data) {
    var body;
    // When capturing the body, `buffer` contains the current data (text), and `body_length` contains how many bytes are expected to be read in the body.
    this.buffer_length += data.length;
    this.buffer = Buffer.concat([this.buffer, data], this.buffer_length);
    // As long as the whole body hasn't been received, keep adding the new data into the buffer.
    if (this.buffer_length < this.body_length) {
      return;
    }
    // Consume the body once it has been fully received.
    body = this.buffer.toString('utf8', 0, this.body_length);
    this.buffer = this.buffer.slice(this.body_length);
    this.buffer_length -= this.body_length;
    this.body_length = 0;
    // Process the content at each step.
    this.process(this.headers, body);
    this.headers = {};
    // Re-parse whatever data was left after the body was fully consumed.
    this.capture_headers(Buffer.alloc(0));
  }

  // ### Capture headers
  capture_headers(data) {
    var header_end, header_text;
    // Capture headers, meaning up to the first blank line.
    this.buffer_length += data.length;
    this.buffer = Buffer.concat([this.buffer, data], this.buffer_length);
    // Wait until we reach the end of the header.
    header_end = this.buffer.indexOf('\n\n');
    if (header_end < 0) {
      return;
    }
    // Consume the headers
    header_text = this.buffer.toString('utf8', 0, header_end);
    this.buffer = this.buffer.slice(header_end + 2);
    this.buffer_length -= header_end + 2;
    // Parse the header lines
    this.headers = parse_header_text(header_text);
    // Figure out whether a body is expected
    if (this.headers["Content-Length"]) {
      this.body_length = parseInt(this.headers["Content-Length"], 10);
      // Parse the body (and eventually process)
      this.capture_body(Buffer.alloc(0));
    } else {
      // Process the (header-only) content
      this.process(this.headers);
      this.headers = {};
      // Re-parse whatever data was left after these headers were fully consumed.
      this.capture_headers(Buffer.alloc(0));
    }
  }

};

// Headers parser
// ==============

// Event Socket framing contains headers and a body.
// The header must be decoded first to learn the presence and length of the body.
export var parse_header_text = function(header_text) {
  var header_lines, headers, i, len, line, name, ref, ref1;
  header_lines = header_text.split('\n');
  headers = {};
  for (i = 0, len = header_lines.length; i < len; i++) {
    line = header_lines[i];
    (function(line) {
      var name, value;
      [name, value] = line.split(/: /, 2);
      return headers[name] = value;
    })(line);
  }
  // Decode headers: in the case of the "connect" command, the headers are all URI-encoded.
  if (((ref = headers['Reply-Text']) != null ? ref[0] : void 0) === '%') {
    for (name in headers) {
      headers[name] = querystring.unescape((ref1 = headers[name]) != null ? ref1 : '');
    }
  }
  return headers;
};
