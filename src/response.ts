// Response and associated API
// ===========================
import { EventEmitter } from 'node:events'

import {
  ulid
} from 'ulidx'

import {
  FreeSwitchParser,
  parse_header_text
} from './parser.js'

import { type Socket } from 'node:net'

type StringMap = Record<string, string | undefined>

type ResponseLogger = (msg: string, data: { ref: string, [key: string]: unknown }) => void

interface FreeSwitchResponseLogger {
  debug: ResponseLogger
  info: ResponseLogger
  error: ResponseLogger
}

const async_log = function<T>(msg: string, ref: string, af: () => Promise<T>, logger: FreeSwitchResponseLogger): () => Promise<T> {
  return async function () {
    return await af().catch(function (error) {
      logger.error(`FreeSwitchResponse::async_log: ${msg}`, { error, ref })
      throw error
    })
  }
}

export class FreeSwitchError extends Error {
  public readonly res: StringMap
  public readonly args: Record<string, string | StringMap | undefined>
  constructor (res: StringMap, args: Record<string, string | StringMap | undefined>) {
    super()
    this.res = res
    this.args = args
  }

  toString (): string {
    return `FreeSwitchError: ${JSON.stringify(this.args)}`
  }
}

export class FreeSwitchUnhandledContentTypeError extends Error {
  public readonly content_type: string
  constructor (content_type: string) {
    super()
    this.content_type = content_type
  }

  toString (): string {
    return `FreeSwitchUnhandledContentTypeError: ${this.content_type}`
  }
}

export class FreeSwitchMissingContentTypeError extends Error {
  public readonly headers: StringMap
  public readonly body: string
  constructor (headers: StringMap, body: string) {
    super()
    this.headers = headers
    this.body = body
  }

  toString (): string {
    return `FreeSwitchMissingContentTypeError: ${JSON.stringify({ headers: this.headers, body: this.body })}`
  }
}

export class FreeSwitchMissingEventNameError extends Error {
  public readonly headers: StringMap
  public readonly body: string
  constructor (headers: StringMap, body: string) {
    super()
    this.headers = headers
    this.body = body
  }

  toString (): string {
    return `FreeSwitchMissingEventNameError: ${JSON.stringify({ headers: this.headers, body: this.body })}`
  }
}

export class FreeSwitchTimeout extends Error {
  public readonly timeout: number
  public readonly text: string
  constructor (timeout: number, text: string) {
    super()
    this.timeout = timeout
    this.text = text
  }

  toString (): string {
    return `FreeSwitchTimeout: Timeout after ${this.timeout}ms waiting for ${this.text}`
  }
}

  // List from https://github.com/signalwire/freeswitch/blob/master/src/switch_event.c#L137
  type EventName =
    | 'CUSTOM'
    | 'CLONE'
    | 'CHANNEL_CREATE'
    | 'CHANNEL_DESTROY'
    | 'CHANNEL_STATE'
    | 'CHANNEL_CALLSTATE'
    | 'CHANNEL_ANSWER'
    | 'CHANNEL_HANGUP'
    | 'CHANNEL_HANGUP_COMPLETE'
    | 'CHANNEL_EXECUTE'
    | 'CHANNEL_EXECUTE_COMPLETE'
    | 'CHANNEL_HOLD'
    | 'CHANNEL_UNHOLD'
    | 'CHANNEL_BRIDGE'
    | 'CHANNEL_UNBRIDGE'
    | 'CHANNEL_PROGRESS'
    | 'CHANNEL_PROGRESS_MEDIA'
    | 'CHANNEL_OUTGOING'
    | 'CHANNEL_PARK'
    | 'CHANNEL_UNPARK'
    | 'CHANNEL_APPLICATION'
    | 'CHANNEL_ORIGINATE'
    | 'CHANNEL_UUID'
    | 'API'
    | 'LOG'
    | 'INBOUND_CHAN'
    | 'OUTBOUND_CHAN'
    | 'STARTUP'
    | 'SHUTDOWN'
    | 'PUBLISH'
    | 'UNPUBLISH'
    | 'TALK'
    | 'NOTALK'
    | 'SESSION_CRASH'
    | 'MODULE_LOAD'
    | 'MODULE_UNLOAD'
    | 'DTMF'
    | 'MESSAGE'
    | 'PRESENCE_IN'
    | 'NOTIFY_IN'
    | 'PRESENCE_OUT'
    | 'PRESENCE_PROBE'
    | 'MESSAGE_WAITING'
    | 'MESSAGE_QUERY'
    | 'ROSTER'
    | 'CODEC'
    | 'BACKGROUND_JOB'
    | 'DETECTED_SPEECH'
    | 'DETECTED_TONE'
    | 'PRIVATE_COMMAND'
    | 'HEARTBEAT'
    | 'TRAP'
    | 'ADD_SCHEDULE'
    | 'DEL_SCHEDULE'
    | 'EXE_SCHEDULE'
    | 'RE_SCHEDULE'
    | 'RELOADXML'
    | 'NOTIFY'
    | 'PHONE_FEATURE'
    | 'PHONE_FEATURE_SUBSCRIBE'
    | 'SEND_MESSAGE'
    | 'RECV_MESSAGE'
    | 'REQUEST_PARAMS'
    | 'CHANNEL_DATA'
    | 'GENERAL'
    | 'COMMAND'
    | 'SESSION_HEARTBEAT'
    | 'CLIENT_DISCONNECTED'
    | 'SERVER_DISCONNECTED'
    | 'SEND_INFO'
    | 'RECV_INFO'
    | 'RECV_RTCP_MESSAGE'
    | 'SEND_RTCP_MESSAGE'
    | 'CALL_SECURE'
    | 'NAT'
    | 'RECORD_START'
    | 'RECORD_STOP'
    | 'PLAYBACK_START'
    | 'PLAYBACK_STOP'
    | 'CALL_UPDATE'
    | 'FAILURE'
    | 'SOCKET_DATA'
    | 'MEDIA_BUG_START'
    | 'MEDIA_BUG_STOP'
    | 'CONFERENCE_DATA_QUERY'
    | 'CONFERENCE_DATA'
    | 'CALL_SETUP_REQ'
    | 'CALL_SETUP_RESULT'
    | 'CALL_DETAIL'
    | 'DEVICE_STATE'
    | 'TEXT'
    | 'SHUTDOWN_REQUESTED'
    | 'ALL'

interface FreeSwitchEventData { headers: StringMap, body: StringMap }
type SendResult = Promise<FreeSwitchEventData> // or FreeSwitchError

export declare interface FreeSwitchResponseEventEmitter {
  // Not listing internally-processed events.
  on: ((event: 'socket.close', cb: () => void) => this) & ((event: 'socket.error', cb: (err: Error) => void) => this) & ((event: 'socket.write', cb: (err: Error) => void) => this) & ((event: 'socket.end', cb: (err: Error) => void) => this) & ((event: 'error.missing-content-type', cb: (err: FreeSwitchMissingContentTypeError) => void) => this) & ((event: 'error.unhandled-content-type', cb: (err: FreeSwitchUnhandledContentTypeError) => void) => this) & ((event: 'error.invalid-json', cb: (err: Error) => void) => this) & ((event: 'error.missing-e80.67.179.206vent-name', cb: (err: FreeSwitchMissingEventNameError) => void) => this) & ((event: 'cleanup_linger', cb: () => void) => this) & ((event: 'freeswitch_log_data', cb: (data: { headers: StringMap, body: string }) => void) => this) & ((event: 'freeswitch_disconnect_notice', cb: (data: { headers: StringMap, body: string }) => void) => this) & ((event: 'freeswitch_rude_rejection', cb: (data: { headers: StringMap, body: string }) => void) => this) & ((event: EventName, cb: (data: FreeSwitchEventData) => void) => this)
  // May also receive `freeswitch_<content_type>` — these are errors, though,
  // we should support all content-types reported by mod_event_socket at this
  // time.
  // on(event:string, cb:(data:{ headers: StringMap, body: string }) => void) : void;
}

export class FreeSwitchResponse extends EventEmitter implements FreeSwitchResponseEventEmitter {
  public closed: boolean = true

  private readonly __ref: string = ulid()
  private __uuid: string | undefined = undefined
  private readonly __socket: Socket
  private readonly logger: FreeSwitchResponseLogger
  private __queue: Promise<null | unknown>
  private readonly __later: Map<string, FreeSwitchEventData>

  private readonly __parser: FreeSwitchParser

  // The module provides statistics in the `stats` object if it is initialized. You may use it  to collect your own call-related statistics.
  public stats: {
    missing_content_type: bigint
    missing_event_name: bigint
    auth_request: bigint
    command_reply: bigint
    events: bigint
    json_parse_errors: bigint
    log_data: bigint
    disconnect: bigint
    api_responses: bigint
    rude_rejections: bigint
    unhandled: bigint
  } = {
      missing_content_type: 0n,
      missing_event_name: 0n,
      auth_request: 0n,
      command_reply: 0n,
      events: 0n,
      json_parse_errors: 0n,
      log_data: 0n,
      disconnect: 0n,
      api_responses: 0n,
      rude_rejections: 0n,
      unhandled: 0n
    }

  // The `FreeSwitchResponse` is bound to a single socket (dual-stream). For outbound (server) mode this would represent a single socket call from FreeSwitch.
  constructor (socket: Socket, logger: FreeSwitchResponseLogger) {
    super({
      captureRejections: true
    })
    this.setMaxListeners(2000)
    socket.setKeepAlive(true)
    socket.setNoDelay(true)
    // Uniquely identify each instance, for tracing purposes.
    this.__socket = socket
    this.logger = logger

    // Make the command responses somewhat unique. This is required since FreeSwitch doesn't provide us a way to match responses with requests.
    this.on('CHANNEL_EXECUTE_COMPLETE', (res: FreeSwitchEventData) => {
      const event_uuid = res.body['Application-UUID']
      this.logger.debug('FreeSwitchResponse: CHANNEL_EXECUTE_COMPLETE', {
        event_uuid,
        ref: this.__ref
      })
      this.emit(`CHANNEL_EXECUTE_COMPLETE ${event_uuid}`, res)
    })
    this.on('BACKGROUND_JOB', (res: FreeSwitchEventData) => {
      const job_uuid = res.body['Job-UUID']
      this.logger.debug('FreeSwitchResponse: BACKGROUND_JOB', {
        job_uuid,
        ref: this.__ref
      })
      this.emit_later(`BACKGROUND_JOB ${job_uuid}`, res)
    })

    // The parser is responsible for de-framing messages coming from FreeSwitch and splitting it into headers and a body.
    // We then process those in order to generate higher-level events.
    this.__parser = new FreeSwitchParser(this.__socket, (headers: StringMap, body: string) => {
      void this.__parser
      this.process(headers, body)
    })

    // The object also provides a queue for operations which need to be submitted one after another on a given socket because FreeSwitch does not provide ways to map event socket requests and responses in the general case.
    this.__queue = Promise.resolve(null)
    // The object also provides a mechanism to report events that might already have been triggered.
    this.__later = new Map()
    // We also must track connection close in order to prevent writing to a closed socket.
    this.closed = false
    const socket_once_close = (): void => {
      this.logger.debug('FreeSwitchResponse: Socket closed', {
        ref: this.__ref
      })
      this.emit('socket.close')
    }
    this.__socket.once('close', socket_once_close)
    // Default handler for `error` events to prevent `Unhandled 'error' event` reports.
    const socket_on_error = (err: Error): void => {
      this.logger.debug('FreeSwitchResponse: Socket Error', {
        ref: this.__ref,
        error: err
      })
      this.emit('socket.error', err)
    }
    this.__socket.on('error', socket_on_error)
    // After the socket is closed or errored, this object is no longer usable.
    const once_socket_star = (reason: string): void => {
      this.logger.debug('FreeSwitchResponse: Terminate', {
        ref: this.__ref,
        reason
      })
      if (!this.closed) {
        this.closed = true
        // @__socket.resetAndDestroy()
        this.__socket.end()
      }
      this.removeAllListeners()
      this.__queue = Promise.resolve(null)
      this.__later.clear()
    }
    this.once('socket.error', once_socket_star)
    this.once('socket.close', once_socket_star)
    this.once('socket.write', once_socket_star)
    this.once('socket.end', once_socket_star)
  }

  setUUID (uuid: string): void {
    this.__uuid = uuid
  }

  uuid (): string | undefined {
    return this.__uuid
  }

  ref (): string {
    return this.__ref
  }

  private async error<T>(res: StringMap, data: Record<string, string | StringMap | undefined>): Promise<T> {
    this.logger.error('FreeSwitchResponse: error: new FreeSwitchError', {
      ref: this.__ref,
      res,
      data
    })
    return await Promise.reject(new FreeSwitchError(res, data))
  }

  // onceAsync
  onceAsync (event:
  | 'freeswitch_auth_request'
  | 'freeswitch_api_response',
    timeout: number,
    comment: string
  ): Promise<{ headers: StringMap, body: string }>
  onceAsync (event:
  | 'freeswitch_command_reply'
  | `CHANNEL_EXECUTE_COMPLETE ${string}`
  | 'freeswitch_auth_request'
  | `BACKGROUND_JOB ${string}`,
    timeout: number,
    comment: string
  ): Promise<FreeSwitchEventData>

  async onceAsync (event:
  | 'freeswitch_auth_request'
  | 'freeswitch_api_response'
  | 'freeswitch_command_reply'
  | `CHANNEL_EXECUTE_COMPLETE ${string}`
  | 'freeswitch_auth_request'
  | `BACKGROUND_JOB ${string}`,
  timeout: number,
  comment: string
  ): Promise<{ headers: StringMap, body: string } | FreeSwitchEventData> {
    this.logger.debug('FreeSwitchResponse: onceAsync: awaiting', {
      event,
      comment,
      ref: this.__ref,
      timeout
    })
    const onceAsyncHandler = <T>(resolve: (arg: T) => void, reject: (err: Error) => void): void => {
      const on_event = (arg: T): void => {
        this.logger.debug('FreeSwitchResponse: onceAsync: on_event', {
          event,
          comment,
          ref: this.__ref
        })
        cleanup()
        resolve(arg)
      }
      const on_error = (error: Error): void => {
        this.logger.error('FreeSwitchResponse: onceAsync: on_error', {
          event,
          comment,
          ref: this.__ref,
          error
        })
        cleanup()
        reject(error)
      }
      const on_close = (): void => {
        this.logger.error('FreeSwitchResponse: onceAsync: on_close', {
          event,
          comment,
          ref: this.__ref
        })
        cleanup()
        reject(new Error(`Socket closed (${this.__ref}) while waiting for ${event} in ${comment}`))
      }
      const on_end = (): void => {
        this.logger.error('FreeSwitchResponse: onceAsync: on_end', {
          event,
          comment,
          ref: this.__ref
        })
        cleanup()
        reject(new Error(`end() called (${this.__ref}) while waiting for ${event} in ${comment}`))
      }
      const on_timeout = (): void => {
        this.logger.error('FreeSwitchResponse: onceAsync: on_timeout', {
          event,
          comment,
          ref: this.__ref,
          timeout
        })
        cleanup()
        reject(new FreeSwitchTimeout(timeout, `(${this.__ref}) event ${event} in ${comment}`))
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = (): void => {
        this.removeListener(event, on_event)
        this.removeListener('socket.error', on_error)
        this.removeListener('socket.close', on_close)
        this.removeListener('socket.write', on_error)
        this.removeListener('socket.end', on_end)
        clearTimeout(timer)
      }
      this.once(event, on_event)
      this.once('socket.error', on_error)
      this.once('socket.close', on_close)
      this.once('socket.write', on_error)
      this.once('socket.end', on_end)
      if (timeout != null) {
        timer = setTimeout(on_timeout, timeout)
      }
    }
    return await new Promise(onceAsyncHandler)
  }

  // Queueing
  // ========

  // Enqueue a function that returns a Promise.
  // The function is only called when all previously enqueued functions-that-return-Promises are completed and their respective Promises fulfilled or rejected.
  async enqueue<T>(f: () => T): Promise<T> {
    if (this.closed) {
      return await this.error({}, {
        when: 'enqueue on closed socket'
      })
    }
    const q = this.__queue
    const next = (async function () {
      await q
      return (f())
    })()
    this.__queue = next.catch(function () {
      return true
    })
    return await next
  }

  // Sync/Async event
  // ================

  // waitAsync
  // ---------

  // In some cases the event might have been emitted before we are ready to receive it.
  // In that case we store the data in `@__later` so that we can emit the event when the recipient is ready.
  async waitAsync (event: `BACKGROUND_JOB ${string}`, timeout: number, comment: string): SendResult {
    const v = this.__later.get(event)
    if (!this.closed && v != null) {
      this.__later.delete(event)
      return await Promise.resolve(v)
    } else {
      return await this.onceAsync(event, timeout, `waitAsync ${comment}`)
    }
  }

  // emit_later
  // ----------

  // This is used for events that might trigger before we set the `once` receiver.
  emit_later (event: string, data: FreeSwitchEventData): boolean {
    const handled = this.emit(event, data)
    if (!this.closed && !handled) {
      this.__later.set(event, data)
    }
    return handled
  }

  // Low-level sending
  // =================

  // These methods are normally not used directly.

  // write
  // -----

  // Send a single command to FreeSwitch; `args` is a hash of headers sent with the command.
  async write (command: string, args: StringMap): Promise<null> {
    if (this.closed) {
      return await this.error({}, {
        when: 'write on closed socket',
        command,
        args
      })
    }
    const writeHandler = (resolve: (v: null) => void, reject: (error: unknown) => void): void => {
      try {
        this.logger.debug('FreeSwitchResponse: write', {
          ref: this.__ref,
          command,
          args
        })
        let text = `${command}\n`
        if (args != null) {
          for (const key in args) {
            const value = args[key]
            if (value != null) {
              text += `${key}: ${value}\n`
            }
          }
        }
        text += '\n'
        this.logger.debug('FreeSwitchResponse: write', {
          ref: this.__ref,
          text
        })
        const flushed = this.__socket.write(text, 'utf8')
        if (!flushed) {
          this.logger.debug('FreeSwitchResponse: write did not flush', {
            ref: this.__ref,
            command,
            args
          })
        }
        resolve(null)
      } catch (error) {
        this.logger.error('FreeSwitchResponse: write error', {
          ref: this.__ref,
          command,
          args,
          error
        })
        // Cancel any pending Promise started with `@onceAsync`, and close the connection.
        this.emit('socket.write', error)
        reject(error)
      }
    }
    return await new Promise(writeHandler)
  }

  // send
  // ----

  // A generic way of sending commands to FreeSwitch, wrapping `write` into a Promise that waits for FreeSwitch's notification that the command completed.
  async send (command: string, args: StringMap = {}, timeout: number = FreeSwitchResponse.default_send_timeout): SendResult {
    if (this.closed) {
      return await this.error({}, {
        when: 'send on closed socket',
        command,
        args
      })
    }
    // Typically `command/reply` will contain the status in the `Reply-Text` header while `api/response` will contain the status in the body.
    const msg = `send ${command} ${JSON.stringify(args)}`
    const sendHandler = async (): Promise<never | FreeSwitchEventData> => {
      const p = this.onceAsync('freeswitch_command_reply', timeout, msg)
      const q = this.write(command, args)
      const [res] = (await Promise.all([p, q]))
      this.logger.debug('FreeSwitchResponse: send: received reply', {
        ref: this.__ref,
        command,
        args
      })
      const reply = res?.headers['Reply-Text']
      // The Promise might fail if FreeSwitch's notification indicates an error.
      if (reply == null) {
        this.logger.debug('FreeSwitchResponse: send: no reply', {
          ref: this.__ref,
          command,
          args
        })
        return await this.error({}, {
          when: 'no reply to command',
          command,
          args,
          headers: res.headers,
          body: res.body
        })
      }
      if (reply.match(/^-/) != null) {
        this.logger.debug('FreeSwitchResponse: send: failed', {
          ref: this.__ref,
          reply,
          command,
          args
        })
        return await this.error({}, {
          when: 'command reply',
          reply,
          command,
          args,
          headers: res.headers,
          body: res.body
        })
      }
      // The promise will be fulfilled with the `{headers,body}` object provided by the parser.
      this.logger.debug('FreeSwitchResponse: send: success', {
        ref: this.__ref,
        command,
        args
      })
      return res
    }
    return (await this.enqueue(async_log(msg, this.ref(), sendHandler, this.logger)))
  }

  // end
  // ---

  // Closes the socket.
  end (): void {
    this.logger.debug('FreeSwitchResponse: end', {
      ref: this.__ref
    })
    this.emit('socket.end', 'Socket close requested by application')
  }

  // Process data from the parser
  // ============================

  // Rewrite headers as needed to work around some weirdnesses in the protocol; and assign unified event IDs to the Event Socket's Content-Types.
  /**
     * @param { { [key:string]: string } } headers
     * @param { string } body
     */
  process (headers: StringMap, body: string): void {
    this.logger.debug('FreeSwitchResponse::process', {
      ref: this.__ref,
      headers,
      body
    })
    const content_type = headers['Content-Type']
    if (content_type == null) {
      this.stats.missing_content_type++
      this.logger.error('FreeSwitchResponse::process: missing-content-type', {
        ref: this.__ref,
        headers,
        body
      })
      this.emit('error.missing-content-type', new FreeSwitchMissingContentTypeError(headers, body))
      return
    }
    // Notice how all our (internal) event names are lower-cased; FreeSwitch always uses full-upper-case event names.
    let body_values: StringMap | undefined
    let event: string | undefined
    switch (content_type) {
      // auth/request
      // ------------

      // FreeSwitch sends an authentication request when a client connect to the Event Socket.
      // Normally caught by the client code, there is no need for your code to monitor this event.
      case 'auth/request':
      {
        event = 'freeswitch_auth_request'
        this.stats.auth_request++
        break
      }

      // command/reply
      // -------------

      // Commands trigger this type of event when they are submitted.
      // Normally caught by `send`, there is no need for your code to monitor this event.
      case 'command/reply':
      {
        event = 'freeswitch_command_reply'
        // Apparently a bug in the response to `connect` causes FreeSwitch to send the headers in the body.
        if (headers['Event-Name'] === 'CHANNEL_DATA') {
          if (body_values != null && 'Content-Type' in body_values && 'Reply-Text' in body_values &&
              'Socket-Mode' in body_values && 'Control' in body_values) {
            const {
              ['Content-Type' as const]: contentType,
              ['Reply-Text' as const]: replyText,
              ['Socket-Mode' as const]: socketMode,
              ['Control' as const]: control,
              ...bodyValuesWithout
            } = body_values
            body_values = bodyValuesWithout
            headers = {
              'Content-Type': contentType,
              'Reply-Text': replyText,
              'Socket-Mode': socketMode,
              Control: control
            }
          }
        }
        this.stats.command_reply++
        break
      }

      // text/event-json
      // ---------------

      // A generic event with a JSON body. We map it to its own Event-Name.
      case 'text/event-json':
      {
        this.stats.events++
        try {
          // Strip control characters that might be emitted by FreeSwitch.
          body = body.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
          // Parse the JSON body.
          body_values = JSON.parse(body)
        } catch (exception) {
          // In case of error report it as an error.
          this.logger.error('FreeSwitchResponse: Invalid JSON', {
            ref: this.__ref,
            body
          })
          this.stats.json_parse_errors++
          this.emit('error.invalid-json', exception)
          return
        }
        // Otherwise trigger the proper event.
        const new_event = body_values != null ? body_values['Event-Name'] : undefined
        if (new_event != null) {
          event = new_event
        } else {
          this.logger.error('FreeSwitchResponse: Missing event name', {
            ref: this.__ref,
            body
          })
          this.stats.missing_event_name++
          this.emit('error.missing-event-name', { headers, body })
          return
        }
        break
      }

      // text/event-plain
      // ----------------

      // Same as `text/event-json` except the body is encoded using plain text. Either way the module provides you with a parsed body (a hash/Object).
      case 'text/event-plain':
      {
        this.stats.events++
        body_values = parse_header_text(body)
        const new_event = body_values != null ? body_values['Event-Name'] : undefined
        if (new_event != null) {
          event = new_event
        } else {
          this.logger.error('FreeSwitchResponse: Missing event name', {
            ref: this.__ref,
            body
          })
          this.stats.missing_event_name++
          this.emit('error.missing-event-name', { headers, body })
          return
        }
        break
      }

      // log/data
      // --------
      case 'log/data':
      {
        event = 'freeswitch_log_data'
        this.stats.log_data++
        break
      }

      // text/disconnect-notice
      // ----------------------

      // FreeSwitch's indication that it is disconnecting the socket.
      // You normally do not have to monitor this event; the `autocleanup` methods catches this event and emits either `freeswitch_disconnect` or `freeswitch_linger`, monitor those events instead.
      case 'text/disconnect-notice':
      {
        event = 'freeswitch_disconnect_notice'
        this.stats.disconnect++
        break
      }

      // api/response
      // ------------

      // Triggered when an `api` message returns. Due to the inability to map those responses to requests, you might want to use `queue_api` instead of `api` for concurrent usage.
      // You normally do not have to monitor this event, the `api` methods catches it.
      case 'api/response':
      {
        event = 'freeswitch_api_response'
        this.stats.api_responses++
        break
      }

      case 'text/rude-rejection':
      {
        event = 'freeswitch_rude_rejection'
        this.stats.rude_rejections++
        break
      }

      default:
      {
        // Ideally other content-types should be individually specified. In any case we provide a fallback mechanism.
        // Others?
        // -------
        this.logger.error('FreeSwitchResponse: Unhandled Content-Type', {
          ref: this.__ref,
          content_type
        })
        event = `freeswitch_${content_type.replace(/[^a-z]/, '_')}`
        this.emit('error.unhandled-content-type', new FreeSwitchUnhandledContentTypeError(content_type))
        this.stats.unhandled++
        break
      }
    }
    // Event content
    // -------------

    // The messages sent at the server- or client-level only contain the headers and the body, possibly modified by the above code.
    const msg = {
      headers,
      body: body_values ?? body
    }
    this.logger.debug('FreeSwitchResponse::process emit', {
      ref: this.__ref,
      event,
      msg
    })
    this.emit(event, msg)
  }

  // Channel-level commands
  // ======================

  // api
  // ---

  // Send an API command, see [Mod commands](http://wiki.freeswitch.org/wiki/Mod_commands) for a list.
  // Returns a Promise that is fulfilled as soon as FreeSwitch sends a reply. Requests are queued and each request is matched with the first-coming response, since there is no way to match between requests and responses.
  // Use `bgapi` if you need to make sure responses are correct, since it provides the proper semantices.
  /**
     * @throws {FreeSwitchError}
     */
  async api (command: string, timeout: number =
  FreeSwitchResponse.default_command_timeout): Promise<{ headers: StringMap, body: string, uuid?: string }> {
    this.logger.debug('FreeSwitchResponse: api', {
      ref: this.__ref,
      command
    })
    if (this.closed) {
      return await this.error({}, {
        when: 'api on closed socket',
        command
      })
    }
    const msg = `api ${command}`
    const apiHandler = async (): Promise<never | { headers: StringMap, body: string, uuid?: string }> => {
      const p = this.onceAsync('freeswitch_api_response', timeout, msg)
      const q = this.write(msg, {})
      const [res] = (await Promise.all([p, q]))
      this.logger.debug('FreeSwitchResponse: api: response', {
        ref: this.__ref,
        command
      })
      const reply: string = res?.body
      // The Promise might fail if FreeSwitch indicates there was an error.
      if (reply == null) {
        this.logger.debug('FreeSwitchResponse: api: no reply', {
          ref: this.__ref,
          command
        })
        return await this.error({}, {
          when: 'no reply to api',
          command,
          headers: res.headers,
          body: res.body
        })
      }
      if (reply.match(/^-/) != null) {
        this.logger.debug('FreeSwitchResponse: api response failed', {
          ref: this.__ref,
          reply,
          command
        })
        return await this.error({}, {
          when: 'api response',
          reply,
          command,
          headers: res.headers,
          body: res.body
        })
      }
      // The Promise that will be fulfilled with `{headers,body,uuid}` from the parser; uuid is the API UUID if one is provided by FreeSwitch.
      return { headers: res.headers, body: res.body, uuid: (reply.match(/^\+OK (\S+)/) ?? [])[1] }
    }
    return (await this.enqueue(async_log(msg, this.ref(), apiHandler, this.logger)))
  }

  // bgapi
  // -----

  // Send an API command in the background. Wraps it inside a Promise.
  async bgapi (command: string, timeout: number = FreeSwitchResponse.default_command_timeout): SendResult {
    this.logger.debug('FreeSwitchResponse: bgapi', {
      ref: this.__ref,
      command,
      timeout
    })
    if (this.closed) {
      return await this.error({}, {
        when: 'bgapi on closed socket',
        command
      })
    }
    const res = await this.send(`bgapi ${command}`)
    const error = async (): Promise<never> => {
      return await this.error({}, {
        when: 'bgapi did not provide a Job-UUID',
        command,
        headers: res.headers,
        body: res.body
      })
    }
    if (res == null) {
      return await error()
    }
    const reply = res.headers['Reply-Text']
    let r: string = (reply?.match(/\+OK Job-UUID: (.+)$/) ?? [])[1]
    if (r == null && 'Job-UUID' in res.headers && res.headers['Job-UUID'] != null) {
      r = res.headers['Job-UUID']
    }
    if (r == null) {
      return await error()
    }
    this.logger.debug('FreeSwitchResponse: bgapi retrieve', {
      ref: this.__ref,
      reply_match: r
    })
    return (await this.waitAsync(`BACKGROUND_JOB ${r}`, timeout, `bgapi ${command}`))
  }

  // Event reception and filtering
  // =============================

  // event_json
  // ----------

  // Request that the server send us events in JSON format.
  // For example: `res.event_json 'HEARTBEAT'`
  async event_json (...events: EventName[]): SendResult {
    return await this.send(`event json ${events.join(' ')}`)
  }

  // nixevents
  // ---------

  // Remove the given event types from the events ACL.
  async nixevent (...events: EventName[]): SendResult {
    return await this.send(`nixevent ${events.join(' ')}`)
  }

  // noevents
  // --------

  // Remove all events types.
  async noevents (): SendResult {
    return await this.send('noevents')
  }

  // filter
  // ------

  // Generic event filtering
  async filter (header: string, value: string): SendResult {
    return await this.send(`filter ${header} ${value}`)
  }

  // filter_delete
  // -------------

  // Remove a filter.
  async filter_delete (header: string, value: string): SendResult {
    if (value != null) {
      return await this.send(`filter delete ${header} ${value}`)
    } else {
      return await this.send(`filter delete ${header}`)
    }
  }

  // sendevent
  // ---------

  // Send an event into the FreeSwitch event queue.
  async sendevent (event_name: EventName, args: StringMap): SendResult {
    return await this.send(`sendevent ${event_name}`, args)
  }

  // Connection handling
  // ===================

  // auth
  // ----

  // Authenticate with FreeSwitch.

  // This normally not needed since in outbound (server) mode authentication is not required, and for inbound (client) mode the module authenticates automatically when requested.
  async auth (password: string): SendResult {
    return await this.send(`auth ${password}`)
  }

  // connect
  // -------

  // Used in server mode to start the conversation with FreeSwitch.

  // Normally not needed, triggered automatically by the module.
  async connect (): SendResult {
    return await this.send('connect') // Outbound mode
  }

  // linger
  // ------

  // Used in server mode, requests FreeSwitch to not close the socket as soon as the call is over, allowing us to do some post-processing on the call (mainly, receiving call termination events).
  // By default, `esl` with call `exit()` for you after 4 seconds. You need to capture the `cleanup_linger` event if you want to handle things differently.
  async linger (): SendResult {
    return await this.send('linger', {}) // Outbound mode
  }

  // exit
  // ----

  // Send the `exit` command to the FreeSwitch socket.
  // FreeSwitch will respond with "+OK bye" followed by a `disconnect-notice` message, which gets translated into a `freeswitch_disconnect_notice` event internally, which in turn gets translated into either `freeswitch_disconnect` or `freeswitch_linger` depending on whether `linger` was called on the socket.
  // You normally do not need to call `@exit` directly. If you do, make sure you do handle any rejection.
  async exit (): SendResult {
    return await this.send('exit')
  }

  // Event logging
  // =============

  // log
  // ---

  // Enable logging on the socket, optionally setting the log level.
  async log (level: number): SendResult {
    if (level != null) {
      return await this.send(`log ${level}`)
    } else {
      return await this.send('log')
    }
  }

  // nolog
  // -----

  // Disable logging on the socket.
  async nolog (): SendResult {
    return await this.send('nolog')
  }

  // Message sending
  // ===============

  // sendmsg_uuid
  // ------------

  // Send a command to a given UUID.
  async sendmsg_uuid (uuid: string | undefined, command: string, args: StringMap): SendResult {
    const options = args ?? {}
    options['call-command'] = command
    let execute_text = 'sendmsg'
    if (uuid != null) {
      execute_text = `sendmsg ${uuid}`
    } else if (this.__uuid != null) {
      execute_text = `sendmsg ${this.__uuid}`
    }
    const res = this.send(execute_text, options)
    this.logger.debug('FreeSwitchResponse: sendmsg_uuid', {
      ref: this.__ref,
      uuid,
      command,
      args,
      res
    })
    return await res
  }

  // sendmsg
  // -------

  // Send Message, assuming server/outbound ESL mode (in which case the UUID is not required).
  async sendmsg (command: string, args: StringMap): SendResult {
    return await this.sendmsg_uuid(undefined, command, args)
  }

  // Client-mode ("inbound") commands
  // =================================

  // The target UUID must be specified.

  // execute_uuid
  // ------------

  // Execute an application for the given UUID (in client mode).
  async execute_uuid (uuid: string | undefined, app_name: string, app_arg: string, loops?: number, event_uuid?: string): SendResult {
    const options: StringMap = {
      'execute-app-name': app_name,
      'execute-app-arg': app_arg
    }
    if (loops != null) {
      options.loops = loops.toString(10)
    }
    if (event_uuid != null) {
      options['Event-UUID'] = event_uuid
    }
    const res = this.sendmsg_uuid(uuid, 'execute', options)
    this.logger.debug('FreeSwitchResponse: execute_uuid', {
      ref: this.__ref,
      uuid,
      app_name,
      app_arg,
      loops,
      event_uuid,
      res
    })
    return await res
  }

  // TODO: Support the alternate format (with no `execute-app-arg` header but instead a `text/plain` body containing the argument).

  // command_uuid
  // ------------

  // Execute an application synchronously. Return a Promise.
  async command_uuid (uuid: string | undefined, app_name: string, app_arg: string, timeout: number = FreeSwitchResponse.default_command_timeout): SendResult {
    if (app_arg == null) {
      app_arg = ''
    }
    const event_uuid: string = ulid()
    const event = `CHANNEL_EXECUTE_COMPLETE ${event_uuid}` as const
    // The Promise is only fulfilled when the command has completed.
    const p = this.onceAsync(event, timeout, `uuid ${uuid} ${app_name} ${app_arg}`)
    const q = this.execute_uuid(uuid, app_name, app_arg, undefined, event_uuid)
    const [res] = (await Promise.all([p, q]))
    this.logger.debug('FreeSwitchResponse: command_uuid', {
      ref: this.__ref,
      uuid,
      app_name,
      app_arg,
      timeout,
      event_uuid,
      res
    })
    return res
  }

  // hangup_uuid
  // -----------

  // Hangup the call referenced by the given UUID with an optional (FreeSwitch) cause code.
  async hangup_uuid (uuid: string | undefined, hangup_cause?: string): SendResult {
    if (hangup_cause == null) {
      hangup_cause = 'NORMAL_UNSPECIFIED'
    }
    const options = {
      'hangup-cause': hangup_cause
    }
    return await this.sendmsg_uuid(uuid, 'hangup', options)
  }

  // unicast_uuid
  // ------------

  // Forwards the media to and from a given socket.

  // Arguments:
  // - `local-ip`
  // - `local-port`
  // - `remote-ip`
  // - `remote-port`
  // - `transport` (`tcp` or `udp`)
  // - `flags: "native"` (optional: do not transcode to/from L16 audio)
  async unicast_uuid (uuid: string | undefined, args: { 'local-ip': string, 'local-port': number, 'remote-ip': string, 'remote-port': number, transport: 'tcp' | 'udp', flags?: 'native' }): SendResult {
    const options = {
      ...args,
      'local-port': args['local-port'].toString(10),
      'remote-port': args['remote-port'].toString(10)
    } as const
    return await this.sendmsg_uuid(uuid, 'unicast', options)
  }

  // nomedia_uuid
  // ------------

  // Not implemented yet (TODO).

  // Server-mode commands
  // ====================

  // In server (outbound) mode, the target UUID is always our (own) call UUID, so it does not need to be specified.

  // execute
  // -------

  // Execute an application for the current UUID (in server/outbound mode)
  async execute (app_name: string, app_arg: string, loops?: number, event_uuid?: string): SendResult {
    return await this.execute_uuid(undefined, app_name, app_arg, loops, event_uuid)
  }

  // command
  // -------
  async command (app_name: string, app_arg: string, timeout: number = FreeSwitchResponse.default_command_timeout): SendResult {
    return await this.command_uuid(undefined, app_name, app_arg, timeout)
  }

  // hangup
  // ------
  async hangup (hangup_cause?: string): SendResult {
    return await this.hangup_uuid(undefined, hangup_cause)
  }

  // unicast
  // -------
  async unicast (args: { 'local-ip': string, 'local-port': number, 'remote-ip': string, 'remote-port': number, transport: 'tcp' | 'udp', flags?: 'native' }): SendResult {
    return await this.unicast_uuid(undefined, args)
  }

  // TODO: `nomedia`
  // TODO: `getvar`
  // TODO: `divert_events` (?)
  // TODO: `resume` (?)

  // Cleanup at end of call
  // ======================

  // auto_cleanup
  // ------------

  // Clean-up at the end of the connection.
  // Automatically called by the client and server.
  auto_cleanup (): void {
    this.once('freeswitch_disconnect_notice', (res) => {
      this.logger.debug('FreeSwitchResponse: auto_cleanup: Received ESL disconnection notice', {
        ref: this.__ref,
        res
      })
      switch (res.headers['Content-Disposition']) {
        case 'linger':
          this.logger.debug('FreeSwitchResponse: Sending freeswitch_linger', {
            ref: this.__ref
          })
          this.emit('freeswitch_linger')
          break
        case 'disconnect':
          this.logger.debug('FreeSwitchResponse: Sending freeswitch_disconnect', {
            ref: this.__ref
          })
          this.emit('freeswitch_disconnect') // Header might be absent?
          break
        default:
          this.logger.debug('FreeSwitchResponse: Sending freeswitch_disconnect', {
            ref: this.__ref
          })
          this.emit('freeswitch_disconnect')
      }
    })
    // ### Linger

    // In linger mode you may intercept the event `cleanup_linger` to do further processing. However you are responsible for calling `exit()`. If you do not do it, the calls will leak. (Make sure you also `catch` any errors on exit: `exit().catch(...)`.)

    // The default behavior in linger mode is to disconnect the socket after 4 seconds, giving you some time to capture events.
    const linger_delay = 4000
    const once_freeswitch_linger = (): void => {
      this.logger.debug('FreeSwitchResponse: auto_cleanup/linger', {
        ref: this.__ref
      })
      if (this.emit('cleanup_linger')) {
        this.logger.debug('FreeSwitchResponse: auto_cleanup/linger: cleanup_linger processed, make sure you call exit()', {
          ref: this.__ref
        })
      } else {
        this.logger.debug(`FreeSwitchResponse: auto_cleanup/linger: exit() in ${linger_delay}ms`, {
          ref: this.__ref
        })
        setTimeout(() => {
          this.logger.debug('FreeSwitchResponse: auto_cleanup/linger: exit()', {
            ref: this.__ref
          })
          this.exit().catch(function () {
            return true
          })
        }, linger_delay)
      }
    }
    this.once('freeswitch_linger', once_freeswitch_linger)
    // ### Disconnect

    // On disconnect (no linger) mode, you may intercept the event `cleanup_disconnect` to do further processing. However you are responsible for calling `end()` in order to close the socket.

    // Normal behavior on disconnect is to close the socket with `end()`.
    const once_freeswitch_disconnect = (): void => {
      this.logger.debug('FreeSwitchResponse: auto_cleanup/disconnect', {
        ref: this.__ref
      })
      if (this.emit('cleanup_disconnect')) {
        this.logger.debug('FreeSwitchResponse: auto_cleanup/disconnect: cleanup_disconnect processed, make sure you call end()', {
          ref: this.__ref
        })
      } else {
        setTimeout(() => {
          this.logger.debug('FreeSwitchResponse: auto_cleanup/disconnect: end()', {
            ref: this.__ref
          })
          this.end()
        }, 100)
      }
    }
    this.once('freeswitch_disconnect', once_freeswitch_disconnect)
  }

  // Event Emitter
  // =============

  // `default_event_timeout`
  // -----------------------

  // The default timeout waiting for events.

  // Note that this value must be longer than (for exemple) a regular call's duration, if you want to be able to catch `EXECUTE_COMPLETE` on `bridge` commands.
  static default_event_timeout = 9 * 3600 * 1000 // 9 hours

  // `default_send_timeout`
  // ----------------------

  // Formerly `command_timeout`, the timeout for a command sent via `send` when none is specified.
  static default_send_timeout = 10 * 1000 // 10s

  // `default_command_timeout`
  // -------------------------

  // The timeout awaiting for a response to a `command` call.
  static default_command_timeout = 1 * 1000 // 1s
}
