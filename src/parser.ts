// Event Socket stream parser
// ==========================
import { unescape } from 'node:querystring'
import { type Socket } from 'node:net'

export type StringMap = Record<string, string | undefined>

export class FreeSwitchParserError extends Error {
  public readonly error: string
  public readonly buffer: Buffer
  constructor (error: string, buffer: Buffer) {
    super(JSON.stringify({ error, buffer }))
    this.error = error
    this.buffer = buffer
  }
}

type Processor = (headers: StringMap, body: string) => void

export const FreeSwitchParser = (socket: Socket, processMessage: Processor): void => {
  let body_length: number = 0
  let buffer: Buffer = Buffer.alloc(0)
  let buffer_length: number = 0
  let headers: StringMap = {}

  // The Event Socket parser will parse an incoming ES stream, whether your code is acting as a client (connected to the FreeSwitch ES server) or as a server (called back by FreeSwitch due to the "socket" application command).
  // ### Dispatch incoming data into the header or body parsers.

  // Capture the body as needed
  socket.on('data', (data) => {
    if (body_length > 0) {
      capture_body(data)
    } else {
      capture_headers(data)
    }
  })
  // For completeness provide an `on_end()` method.
  socket.once('end', () => {
    if (buffer_length > 0) {
      socket.emit('warning', new FreeSwitchParserError('Buffer is not empty at end of stream', buffer))
    }
  })

  // ### Capture body
  const capture_body = (data: Buffer): void => {
    // When capturing the body, `buffer` contains the current data (text), and `body_length` contains how many bytes are expected to be read in the body.
    buffer_length += data.length
    buffer = Buffer.concat([buffer, data], buffer_length)
    // As long as the whole body hasn't been received, keep adding the new data into the buffer.
    if (buffer_length < body_length) {
      return
    }
    // Consume the body once it has been fully received.
    const body = buffer.toString('utf8', 0, body_length)
    buffer = buffer.subarray(body_length)
    buffer_length -= body_length
    body_length = 0
    // Process the content at each step.
    processMessage(headers, body)
    headers = {}
    // Re-parse whatever data was left after the body was fully consumed.
    capture_headers(Buffer.alloc(0))
  }

  // ### Capture headers
  const capture_headers = (data: Buffer): void => {
    // Capture headers, meaning up to the first blank line.
    buffer_length += data.length
    buffer = Buffer.concat([buffer, data], buffer_length)
    // Wait until we reach the end of the header.
    const header_end = buffer.indexOf('\n\n')
    if (header_end < 0) {
      return
    }
    // Consume the headers
    const header_text = buffer.toString('utf8', 0, header_end)
    buffer = buffer.subarray(header_end + 2)
    buffer_length -= header_end + 2
    // Parse the header lines
    headers = parse_header_text(header_text)
    // Figure out whether a body is expected
    const contentLength = headers['Content-Length']
    if (contentLength?.match(/^\d+$/) != null) {
      body_length = parseInt(contentLength, 10)
      // Parse the body (and eventually process)
      capture_body(Buffer.alloc(0))
    } else {
      // Process the (header-only) content
      processMessage(headers, '')
      headers = {}
      // Re-parse whatever data was left after these headers were fully consumed.
      capture_headers(Buffer.alloc(0))
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
  for (const line of header_lines) {
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
