// Event Socket stream parser
// ==========================
import { unescape } from 'node:querystring'
import { type Socket } from 'node:net'

type StringMap = Record<string, string | undefined>

export class FreeSwitchParserError extends Error {
  public readonly error: string
  public readonly buffer: Buffer
  constructor (error: string, buffer: Buffer) {
    super(JSON.stringify({ error, buffer }))
    this.error = error
    this.buffer = buffer
  }
}

export class FreeSwitchParser {
  private readonly process: (headers: StringMap, body: string) => void
  private body_length: number = 0
  private buffer: Buffer = Buffer.alloc(0)
  private buffer_length: number = 0
  private headers: StringMap = {}
  // The Event Socket parser will parse an incoming ES stream, whether your code is acting as a client (connected to the FreeSwitch ES server) or as a server (called back by FreeSwitch due to the "socket" application command).
  constructor (socket: Socket, process: (headers: StringMap, body: string) => void) {
    this.process = process
    // ### Dispatch incoming data into the header or body parsers.

    // Capture the body as needed
    socket.on('data', (data) => {
      if (this.body_length > 0) {
        this.capture_body(data)
      } else {
        this.capture_headers(data)
      }
    })
    // For completeness provide an `on_end()` method.
    socket.once('end', () => {
      if (this.buffer_length > 0) {
        socket.emit('warning', new FreeSwitchParserError('Buffer is not empty at end of stream', this.buffer))
      }
    })
  }

  // ### Capture body
  capture_body (data: Buffer): void {
    // When capturing the body, `buffer` contains the current data (text), and `body_length` contains how many bytes are expected to be read in the body.
    this.buffer_length += data.length
    this.buffer = Buffer.concat([this.buffer, data], this.buffer_length)
    // As long as the whole body hasn't been received, keep adding the new data into the buffer.
    if (this.buffer_length < this.body_length) {
      return
    }
    // Consume the body once it has been fully received.
    const body = this.buffer.toString('utf8', 0, this.body_length)
    this.buffer = this.buffer.slice(this.body_length)
    this.buffer_length -= this.body_length
    this.body_length = 0
    // Process the content at each step.
    this.process(this.headers, body)
    this.headers = {}
    // Re-parse whatever data was left after the body was fully consumed.
    this.capture_headers(Buffer.alloc(0))
  }

  // ### Capture headers
  capture_headers (data: Buffer): void {
    // Capture headers, meaning up to the first blank line.
    this.buffer_length += data.length
    this.buffer = Buffer.concat([this.buffer, data], this.buffer_length)
    // Wait until we reach the end of the header.
    const header_end = this.buffer.indexOf('\n\n')
    if (header_end < 0) {
      return
    }
    // Consume the headers
    const header_text = this.buffer.toString('utf8', 0, header_end)
    this.buffer = this.buffer.slice(header_end + 2)
    this.buffer_length -= header_end + 2
    // Parse the header lines
    this.headers = parse_header_text(header_text)
    // Figure out whether a body is expected
    const contentLength = this.headers['Content-Length']
    if (contentLength?.match(/^\d+$/) != null) {
      this.body_length = parseInt(contentLength, 10)
      // Parse the body (and eventually process)
      this.capture_body(Buffer.alloc(0))
    } else {
      // Process the (header-only) content
      this.process(this.headers, '')
      this.headers = {}
      // Re-parse whatever data was left after these headers were fully consumed.
      this.capture_headers(Buffer.alloc(0))
    }
  }
}

// Headers parser
// ==============

// Event Socket framing contains headers and a body.
// The header must be decoded first to learn the presence and length of the body.
export const parse_header_text = function (header_text: string): StringMap {
  const header_lines = header_text.split('\n')
  const headers: StringMap = {}
  for (let i = 0, len = header_lines.length; i < len; i++) {
    const line = header_lines[i]
    const [name, value] = line.split(/: /, 2)
    headers[name] = value
  }
  // Decode headers: in the case of the "connect" command, the headers are all URI-encoded.
  const reply_text = headers['Reply-Text']
  if (reply_text != null && (reply_text[0] ?? '') === '%') {
    for (const name in headers) {
      headers[name] = unescape(headers[name] ?? '')
    }
  }
  return headers
}
