// Response and associated API
// ===========================
import { FreeSwitchEventEmitter } from './event-emitter.js'

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

export interface FreeSwitchResponseLogger {
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
  public readonly res: FreeSwitchEventData | { headers: StringMap, body: string } | undefined
  public readonly args: Record<string, string | StringMap | undefined>
  constructor (res: FreeSwitchEventData | { headers: StringMap, body: string } | undefined, args: Record<string, string | StringMap | undefined>) {
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

const EventNames = new Set<EventName>([
  'CUSTOM',
  'CLONE',
  'CHANNEL_CREATE',
  'CHANNEL_DESTROY',
  'CHANNEL_STATE',
  'CHANNEL_CALLSTATE',
  'CHANNEL_ANSWER',
  'CHANNEL_HANGUP',
  'CHANNEL_HANGUP_COMPLETE',
  'CHANNEL_EXECUTE',
  'CHANNEL_EXECUTE_COMPLETE',
  'CHANNEL_HOLD',
  'CHANNEL_UNHOLD',
  'CHANNEL_BRIDGE',
  'CHANNEL_UNBRIDGE',
  'CHANNEL_PROGRESS',
  'CHANNEL_PROGRESS_MEDIA',
  'CHANNEL_OUTGOING',
  'CHANNEL_PARK',
  'CHANNEL_UNPARK',
  'CHANNEL_APPLICATION',
  'CHANNEL_ORIGINATE',
  'CHANNEL_UUID',
  'API',
  'LOG',
  'INBOUND_CHAN',
  'OUTBOUND_CHAN',
  'STARTUP',
  'SHUTDOWN',
  'PUBLISH',
  'UNPUBLISH',
  'TALK',
  'NOTALK',
  'SESSION_CRASH',
  'MODULE_LOAD',
  'MODULE_UNLOAD',
  'DTMF',
  'MESSAGE',
  'PRESENCE_IN',
  'NOTIFY_IN',
  'PRESENCE_OUT',
  'PRESENCE_PROBE',
  'MESSAGE_WAITING',
  'MESSAGE_QUERY',
  'ROSTER',
  'CODEC',
  'BACKGROUND_JOB',
  'DETECTED_SPEECH',
  'DETECTED_TONE',
  'PRIVATE_COMMAND',
  'HEARTBEAT',
  'TRAP',
  'ADD_SCHEDULE',
  'DEL_SCHEDULE',
  'EXE_SCHEDULE',
  'RE_SCHEDULE',
  'RELOADXML',
  'NOTIFY',
  'PHONE_FEATURE',
  'PHONE_FEATURE_SUBSCRIBE',
  'SEND_MESSAGE',
  'RECV_MESSAGE',
  'REQUEST_PARAMS',
  'CHANNEL_DATA',
  'GENERAL',
  'COMMAND',
  'SESSION_HEARTBEAT',
  'CLIENT_DISCONNECTED',
  'SERVER_DISCONNECTED',
  'SEND_INFO',
  'RECV_INFO',
  'RECV_RTCP_MESSAGE',
  'SEND_RTCP_MESSAGE',
  'CALL_SECURE',
  'NAT',
  'RECORD_START',
  'RECORD_STOP',
  'PLAYBACK_START',
  'PLAYBACK_STOP',
  'CALL_UPDATE',
  'FAILURE',
  'SOCKET_DATA',
  'MEDIA_BUG_START',
  'MEDIA_BUG_STOP',
  'CONFERENCE_DATA_QUERY',
  'CONFERENCE_DATA',
  'CALL_SETUP_REQ',
  'CALL_SETUP_RESULT',
  'CALL_DETAIL',
  'DEVICE_STATE',
  'TEXT',
  'SHUTDOWN_REQUESTED',
  'ALL'
])
const isEventName = (v: string): v is EventName => EventNames.has(v as EventName)

export interface FreeSwitchEventData { headers: StringMap, body: StringMap }
type SendResult = Promise<FreeSwitchEventData> // or FreeSwitchError

interface FreeSwitchResponseEvents {
  // Not listing internally-processed events.
  // May also receive `freeswitch_<content_type>` — these are errors, though,
  // we should support all content-types reported by mod_event_socket at this
  // time.
  // on(event:string, cb:(data:{ headers: StringMap, body: string }) => void) : void;

  'socket.close': () => void
  'socket.error': (err: Error) => void
  'socket.write': (err: Error) => void
  'socket.end': (err: Error) => void
  'error.missing-content-type': (err: FreeSwitchMissingContentTypeError) => void
  'error.unhandled-content-type': (err: FreeSwitchUnhandledContentTypeError) => void
  'error.invalid-json': (err: Error) => void
  'error.missing-event-name': (err: FreeSwitchMissingEventNameError) => void
  'cleanup_linger': () => void
  'freeswitch_log_data': (data: { headers: StringMap, body: string }) => void
  'freeswitch_disconnect_notice': (data: { headers: StringMap, body: string }) => void
  'freeswitch_rude_rejection': (data: { headers: StringMap, body: string }) => void

  // FIXME not sure how to use EventName here
  'CUSTOM': (data: FreeSwitchEventData) => void
  'CLONE': (data: FreeSwitchEventData) => void
  'CHANNEL_CREATE': (data: FreeSwitchEventData) => void
  'CHANNEL_DESTROY': (data: FreeSwitchEventData) => void
  'CHANNEL_STATE': (data: FreeSwitchEventData) => void
  'CHANNEL_CALLSTATE': (data: FreeSwitchEventData) => void
  'CHANNEL_ANSWER': (data: FreeSwitchEventData) => void
  'CHANNEL_HANGUP': (data: FreeSwitchEventData) => void
  'CHANNEL_HANGUP_COMPLETE': (data: FreeSwitchEventData) => void
  'CHANNEL_EXECUTE': (data: FreeSwitchEventData) => void
  'CHANNEL_EXECUTE_COMPLETE': (data: FreeSwitchEventData) => void
  'CHANNEL_HOLD': (data: FreeSwitchEventData) => void
  'CHANNEL_UNHOLD': (data: FreeSwitchEventData) => void
  'CHANNEL_BRIDGE': (data: FreeSwitchEventData) => void
  'CHANNEL_UNBRIDGE': (data: FreeSwitchEventData) => void
  'CHANNEL_PROGRESS': (data: FreeSwitchEventData) => void
  'CHANNEL_PROGRESS_MEDIA': (data: FreeSwitchEventData) => void
  'CHANNEL_OUTGOING': (data: FreeSwitchEventData) => void
  'CHANNEL_PARK': (data: FreeSwitchEventData) => void
  'CHANNEL_UNPARK': (data: FreeSwitchEventData) => void
  'CHANNEL_APPLICATION': (data: FreeSwitchEventData) => void
  'CHANNEL_ORIGINATE': (data: FreeSwitchEventData) => void
  'CHANNEL_UUID': (data: FreeSwitchEventData) => void
  'API': (data: FreeSwitchEventData) => void
  'LOG': (data: FreeSwitchEventData) => void
  'INBOUND_CHAN': (data: FreeSwitchEventData) => void
  'OUTBOUND_CHAN': (data: FreeSwitchEventData) => void
  'STARTUP': (data: FreeSwitchEventData) => void
  'SHUTDOWN': (data: FreeSwitchEventData) => void
  'PUBLISH': (data: FreeSwitchEventData) => void
  'UNPUBLISH': (data: FreeSwitchEventData) => void
  'TALK': (data: FreeSwitchEventData) => void
  'NOTALK': (data: FreeSwitchEventData) => void
  'SESSION_CRASH': (data: FreeSwitchEventData) => void
  'MODULE_LOAD': (data: FreeSwitchEventData) => void
  'MODULE_UNLOAD': (data: FreeSwitchEventData) => void
  'DTMF': (data: FreeSwitchEventData) => void
  'MESSAGE': (data: FreeSwitchEventData) => void
  'PRESENCE_IN': (data: FreeSwitchEventData) => void
  'NOTIFY_IN': (data: FreeSwitchEventData) => void
  'PRESENCE_OUT': (data: FreeSwitchEventData) => void
  'PRESENCE_PROBE': (data: FreeSwitchEventData) => void
  'MESSAGE_WAITING': (data: FreeSwitchEventData) => void
  'MESSAGE_QUERY': (data: FreeSwitchEventData) => void
  'ROSTER': (data: FreeSwitchEventData) => void
  'CODEC': (data: FreeSwitchEventData) => void
  'BACKGROUND_JOB': (data: FreeSwitchEventData) => void
  'DETECTED_SPEECH': (data: FreeSwitchEventData) => void
  'DETECTED_TONE': (data: FreeSwitchEventData) => void
  'PRIVATE_COMMAND': (data: FreeSwitchEventData) => void
  'HEARTBEAT': (data: FreeSwitchEventData) => void
  'TRAP': (data: FreeSwitchEventData) => void
  'ADD_SCHEDULE': (data: FreeSwitchEventData) => void
  'DEL_SCHEDULE': (data: FreeSwitchEventData) => void
  'EXE_SCHEDULE': (data: FreeSwitchEventData) => void
  'RE_SCHEDULE': (data: FreeSwitchEventData) => void
  'RELOADXML': (data: FreeSwitchEventData) => void
  'NOTIFY': (data: FreeSwitchEventData) => void
  'PHONE_FEATURE': (data: FreeSwitchEventData) => void
  'PHONE_FEATURE_SUBSCRIBE': (data: FreeSwitchEventData) => void
  'SEND_MESSAGE': (data: FreeSwitchEventData) => void
  'RECV_MESSAGE': (data: FreeSwitchEventData) => void
  'REQUEST_PARAMS': (data: FreeSwitchEventData) => void
  'CHANNEL_DATA': (data: FreeSwitchEventData) => void
  'GENERAL': (data: FreeSwitchEventData) => void
  'COMMAND': (data: FreeSwitchEventData) => void
  'SESSION_HEARTBEAT': (data: FreeSwitchEventData) => void
  'CLIENT_DISCONNECTED': (data: FreeSwitchEventData) => void
  'SERVER_DISCONNECTED': (data: FreeSwitchEventData) => void
  'SEND_INFO': (data: FreeSwitchEventData) => void
  'RECV_INFO': (data: FreeSwitchEventData) => void
  'RECV_RTCP_MESSAGE': (data: FreeSwitchEventData) => void
  'SEND_RTCP_MESSAGE': (data: FreeSwitchEventData) => void
  'CALL_SECURE': (data: FreeSwitchEventData) => void
  'NAT': (data: FreeSwitchEventData) => void
  'RECORD_START': (data: FreeSwitchEventData) => void
  'RECORD_STOP': (data: FreeSwitchEventData) => void
  'PLAYBACK_START': (data: FreeSwitchEventData) => void
  'PLAYBACK_STOP': (data: FreeSwitchEventData) => void
  'CALL_UPDATE': (data: FreeSwitchEventData) => void
  'FAILURE': (data: FreeSwitchEventData) => void
  'SOCKET_DATA': (data: FreeSwitchEventData) => void
  'MEDIA_BUG_START': (data: FreeSwitchEventData) => void
  'MEDIA_BUG_STOP': (data: FreeSwitchEventData) => void
  'CONFERENCE_DATA_QUERY': (data: FreeSwitchEventData) => void
  'CONFERENCE_DATA': (data: FreeSwitchEventData) => void
  'CALL_SETUP_REQ': (data: FreeSwitchEventData) => void
  'CALL_SETUP_RESULT': (data: FreeSwitchEventData) => void
  'CALL_DETAIL': (data: FreeSwitchEventData) => void
  'DEVICE_STATE': (data: FreeSwitchEventData) => void
  'TEXT': (data: FreeSwitchEventData) => void
  'SHUTDOWN_REQUESTED': (data: FreeSwitchEventData) => void
  'ALL': (data: FreeSwitchEventData) => void

  /* private */
  'freeswitch_auth_request': (data: { headers: StringMap, body: string }) => void
  'freeswitch_command_reply': (data: FreeSwitchEventData | { headers: StringMap, body: string }) => void
  'freeswitch_linger': () => void
  'freeswitch_disconnect': () => void
  'freeswitch_api_response': (data: { headers: StringMap, body: string }) => void
  'cleanup_disconnect': () => void
  [k: `CHANNEL_EXECUTE_COMPLETE ${string}`]: (data: FreeSwitchEventData) => void
  [k: `BACKGROUND_JOB ${string}`]: (data: FreeSwitchEventData) => void
}

export class FreeSwitchResponse extends FreeSwitchEventEmitter<keyof FreeSwitchResponseEvents, FreeSwitchResponseEvents> {
  public closed: boolean = true

  private readonly __ref: string = ulid()
  private __uuid: string | undefined = undefined
  private readonly __socket: Socket
  private readonly logger: FreeSwitchResponseLogger
  private __queue: Promise<true>
  private readonly __later: Map<string, FreeSwitchEventData>

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
    super()
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
    FreeSwitchParser(this.__socket, (headers: StringMap, body: string) => {
      this.process(headers, body)
    })

    // The object also provides a queue for operations which need to be submitted one after another on a given socket because FreeSwitch does not provide ways to map event socket requests and responses in the general case.
    this.__queue = Promise.resolve(true)
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
    const once_socket_star = (reason?: string | Error): void => {
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
      this.__queue = Promise.resolve(true)
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

  private async error<T>(res: FreeSwitchEventData | { headers: StringMap, body: string } | undefined, data: Record<string, string | StringMap | undefined>): Promise<T> {
    this.logger.error('FreeSwitchResponse: error: new FreeSwitchError', {
      ref: this.__ref,
      res,
      data
    })
    return await Promise.reject(new FreeSwitchError(res, data))
  }

  // onceAsync
  async onceAsync<K extends keyof FreeSwitchResponseEvents>(event: K,
    timeout: number,
    comment: string
  ): Promise<Parameters<FreeSwitchResponseEvents[K]>[0]> {
    this.logger.debug('FreeSwitchResponse: onceAsync: awaiting', {
      event,
      comment,
      ref: this.__ref,
      timeout
    })
    const onceAsyncHandler = (resolve: (value: Parameters<FreeSwitchResponseEvents[K]>[0]) => void, reject: (err: Error) => void): void => {
      const on_event = ((value: Parameters<FreeSwitchResponseEvents[K]>[0]): void => {
        this.logger.debug('FreeSwitchResponse: onceAsync: on_event', {
          event,
          comment,
          ref: this.__ref
        })
        cleanup()
        resolve(value)
      }) as FreeSwitchResponseEvents[K]
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

      function isChannelExecuteComplete (t: string): t is `CHANNEL_EXECUTE_COMPLETE ${string}` {
        const s = 'CHANNEL_EXECUTE_COMPLETE '
        return t.substring(0, s.length) === s
      }
      function isBackgroundJob (t: string): t is `BACKGROUND_JOB ${string}` {
        const s = 'BACKGROUND_JOB '
        return t.substring(0, s.length) === s
      }
      if (event === 'freeswitch_auth_request') {
        this.once(event, on_event)
      } else if (event === 'freeswitch_api_response') {
        this.once(event, on_event)
      } else if (event === 'freeswitch_command_reply') {
        this.once(event, on_event)
      } else if (isChannelExecuteComplete(event)) {
        this.once(event, on_event)
      } else if (isBackgroundJob(event)) {
        this.once(event, on_event)
      } else {
        this.once(event, on_event)
      }
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
  async enqueue<T>(f: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return await this.error(undefined, {
        when: 'enqueue on closed socket'
      })
    }
    const q = this.__queue
    const next = (async function () {
      await q
      return (await f())
    })()
    this.__queue = next.then(() => true, () => true)
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
      return v
    } else {
      return await this.onceAsync(event, timeout, `waitAsync ${comment}`)
    }
  }

  // emit_later
  // ----------

  // This is used for events that might trigger before we set the `once` receiver.
  emit_later (event: keyof FreeSwitchResponseEvents, data: FreeSwitchEventData): boolean {
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
      return await this.error(undefined, {
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
        if (error instanceof Error) {
          this.emit('socket.write', error)
        } else {
          this.emit('socket.write', new Error(`${error}`))
        }
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
      return await this.error(undefined, {
        when: 'send on closed socket',
        command,
        args
      })
    }
    // Typically `command/reply` will contain the status in the `Reply-Text` header while `api/response` will contain the status in the body.
    const msg = `send ${command} ${JSON.stringify(args)}`
    const sendHandler = async (): Promise<FreeSwitchEventData> => {
      const p = this.onceAsync('freeswitch_command_reply', timeout, msg)
      const q = this.write(command, args)
      const [res] = (await Promise.all([p, q]))
      const { headers, body } = res
      this.logger.debug('FreeSwitchResponse: send: received reply', {
        ref: this.__ref,
        command,
        args,
        headers,
        body
      })
      const reply = headers['Reply-Text']
      // The Promise might fail if FreeSwitch's notification indicates an error.
      if (reply == null) {
        this.logger.debug('FreeSwitchResponse: send: no reply', {
          ref: this.__ref,
          command,
          args
        })
        return await this.error(res, {
          when: 'no reply to command',
          command,
          args
        })
      }
      if (reply.match(/^-/) != null) {
        this.logger.debug('FreeSwitchResponse: send: failed', {
          ref: this.__ref,
          reply,
          command,
          args
        })
        return await this.error(res, {
          when: 'command reply',
          reply,
          command,
          args
        })
      }
      // The promise will be fulfilled with the `{headers,body}` object provided by the parser.
      this.logger.debug('FreeSwitchResponse: send: success', {
        ref: this.__ref,
        command,
        args
      })
      if (typeof body === 'string') {
        return { headers: res.headers, body: { text: body } }
      } else {
        return { headers, body }
      }
    }
    return await this.enqueue(async_log(msg, this.ref(), sendHandler, this.logger))
  }

  // end
  // ---

  // Closes the socket.
  end (): void {
    this.logger.debug('FreeSwitchResponse: end', {
      ref: this.__ref
    })
    this.emit('socket.end', new Error('Socket close requested by application'))
  }

  // Process data from the parser
  // ============================

  // Rewrite headers as needed to work around some weirdnesses in the protocol; and assign unified event IDs to the Event Socket's Content-Types.
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
    const msg = { headers, body }
    switch (content_type) {
      // auth/request
      // ------------

      // FreeSwitch sends an authentication request when a client connect to the Event Socket.
      // Normally caught by the client code, there is no need for your code to monitor this event.
      case 'auth/request':
      {
        this.stats.auth_request++
        this.emit('freeswitch_auth_request', msg)
        break
      }

      // command/reply
      // -------------

      // Commands trigger this type of event when they are submitted.
      // Normally caught by `send`, there is no need for your code to monitor this event.
      case 'command/reply':
      {
        this.stats.command_reply++
        // Apparently a bug in the response to `connect` causes FreeSwitch to send the headers in the body.
        if (headers['Event-Name'] === 'CHANNEL_DATA') {
          if (headers != null && 'Content-Type' in headers && 'Reply-Text' in headers &&
              'Socket-Mode' in headers && 'Control' in headers) {
            const {
              ['Content-Type' as const]: contentType,
              ['Reply-Text' as const]: replyText,
              ['Socket-Mode' as const]: socketMode,
              ['Control' as const]: control,
              ...bodyValuesWithout
            } = headers
            headers = {
              'Content-Type': contentType,
              'Reply-Text': replyText,
              'Socket-Mode': socketMode,
              Control: control
            }
            const msg = { headers, body: bodyValuesWithout }
            this.emit('freeswitch_command_reply', msg)
            return
          }
        }
        this.emit('freeswitch_command_reply', msg)
        return
      }

      // text/event-json
      // ---------------

      // A generic event with a JSON body. We map it to its own Event-Name.
      case 'text/event-json':
      {
        this.stats.events++
        let body_values: StringMap
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
          if (exception instanceof Error) {
            this.emit('error.invalid-json', exception)
          } else {
            this.emit('error.invalid-json', new Error(`${exception}`))
          }
          return
        }
        // Otherwise trigger the proper event.
        const new_event = body_values != null ? body_values['Event-Name'] : undefined
        if (new_event != null && isEventName(new_event)) {
          const msg = { headers, body: body_values }
          this.emit(new_event, msg)
        } else {
          this.logger.error('FreeSwitchResponse: Missing or unknown event name', {
            ref: this.__ref,
            body
          })
          this.stats.missing_event_name++
          this.emit('error.missing-event-name', new FreeSwitchMissingEventNameError(headers, body))
        }
        return
      }

      // text/event-plain
      // ----------------

      // Same as `text/event-json` except the body is encoded using plain text. Either way the module provides you with a parsed body (a hash/Object).
      case 'text/event-plain':
      {
        this.stats.events++
        const body_values = parse_header_text(body)
        const new_event = body_values != null ? body_values['Event-Name'] : undefined
        if (new_event != null && isEventName(new_event)) {
          const msg = { headers, body: body_values }
          this.emit(new_event, msg)
        } else {
          this.logger.error('FreeSwitchResponse: Missing or unknown event name', {
            ref: this.__ref,
            body
          })
          this.stats.missing_event_name++
          this.emit('error.missing-event-name', new FreeSwitchMissingEventNameError(headers, body))
        }
        return
      }

      // log/data
      // --------
      case 'log/data':
      {
        this.stats.log_data++
        this.emit('freeswitch_log_data', msg)
        return
      }

      // text/disconnect-notice
      // ----------------------

      // FreeSwitch's indication that it is disconnecting the socket.
      // You normally do not have to monitor this event; the `autocleanup` methods catches this event and emits either `freeswitch_disconnect` or `freeswitch_linger`, monitor those events instead.
      case 'text/disconnect-notice':
      {
        this.stats.disconnect++
        this.emit('freeswitch_disconnect_notice', msg)
        return
      }

      // api/response
      // ------------

      // Triggered when an `api` message returns. Due to the inability to map those responses to requests, you might want to use `queue_api` instead of `api` for concurrent usage.
      // You normally do not have to monitor this event, the `api` methods catches it.
      case 'api/response':
      {
        this.stats.api_responses++
        this.emit('freeswitch_api_response', msg)
        return
      }

      case 'text/rude-rejection':
      {
        this.stats.rude_rejections++
        this.emit('freeswitch_rude_rejection', msg)
        return
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
        this.stats.unhandled++
        this.emit('error.unhandled-content-type', new FreeSwitchUnhandledContentTypeError(content_type))
      }
    }
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
  FreeSwitchResponse.default_event_timeout): Promise<{ headers: StringMap, body: string, uuid?: string }> {
    this.logger.debug('FreeSwitchResponse: api', {
      ref: this.__ref,
      command
    })
    if (this.closed) {
      return await this.error(undefined, {
        when: 'api on closed socket',
        command
      })
    }
    const msg = `api ${command}`
    const apiHandler = async (): Promise<{ headers: StringMap, body: string, uuid?: string }> => {
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
        return await this.error(res, {
          when: 'no reply to api',
          command
        })
      }
      if (reply.match(/^-/) != null) {
        this.logger.debug('FreeSwitchResponse: api response failed', {
          ref: this.__ref,
          reply,
          command
        })
        return await this.error(res, {
          when: 'api response',
          reply,
          command
        })
      }
      // The Promise that will be fulfilled with `{headers,body,uuid}` from the parser; uuid is the API UUID if one is provided by FreeSwitch.
      return { headers: res.headers, body: res.body, uuid: (reply.match(/^\+OK (\S+)/) ?? [])[1] }
    }
    return await this.enqueue(async_log(msg, this.ref(), apiHandler, this.logger))
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
      return await this.error(undefined, {
        when: 'bgapi on closed socket',
        command
      })
    }
    const res = await this.send(`bgapi ${command}`)
    const error = async (): Promise<never> => {
      return await this.error(res, {
        when: 'bgapi did not provide a Job-UUID',
        command
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
    const res = await this.send(execute_text, options)
    this.logger.debug('FreeSwitchResponse: sendmsg_uuid', {
      ref: this.__ref,
      uuid,
      command,
      args,
      res
    })
    return res
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
    const res = await this.sendmsg_uuid(uuid, 'execute', options)
    this.logger.debug('FreeSwitchResponse: execute_uuid', {
      ref: this.__ref,
      uuid,
      app_name,
      app_arg,
      loops,
      event_uuid,
      res
    })
    return res
  }

  // TODO: Support the alternate format (with no `execute-app-arg` header but instead a `text/plain` body containing the argument).

  // command_uuid
  // ------------

  // Execute an application synchronously. Return a Promise.
  async command_uuid (uuid: string | undefined, app_name: string, app_arg?: string, timeout: number = FreeSwitchResponse.default_command_timeout): SendResult {
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
  async command (app_name: string, app_arg?: string, timeout: number = FreeSwitchResponse.default_command_timeout): SendResult {
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
