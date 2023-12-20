// Connection Listener (socket events handler)
// ===========================================

// We use the same connection-listener for both client (FreeSwitch "inbound" socket) and server (FreeSwitch "outound" socket).
// This is modelled after Node.js' http.js; the connection-listener is called either when FreeSwitch connects to our server, or when we connect to FreeSwitch from our client.

// Server
// ======

// The server is used when FreeSwitch needs to be able to initiate a connection to
// Node.js so that our code can handle an existing call.

// The parser will be the one receiving the actual data from the socket. We will process the parser's output below.
// The `server` we export is only slightly more complex. It sets up a filter so that the application only gets its own events, and sets up automatic cleanup which will be used before disconnecting the socket.

// The `server` will emit `connection` for every new (incoming) connection, with two arguments:
// - the `FreeSwitchResponse` object
// - { `headers`, `body`, `data`, `uuid` } retrieved from FreeSWITCH connection.

import net from 'node:net'

import { FreeSwitchEventEmitter } from './event-emitter.js'

import {
  FreeSwitchResponse
} from './response.js'

type StringMap = Record<string, string | undefined>
type Logger = (msg: string, data?: unknown) => void

export interface FreeSwitchServerLogger {
  debug: Logger
  info: Logger
  error: Logger
}

interface FreeSwitchServerConstructorOptions {
  all_events?: boolean // default true
  my_events?: boolean // default true
  logger?: FreeSwitchServerLogger // default console
}

interface FreeSwitchServerEvents {
  error: (error: Error) => void
  drop: (data?: { localAddress?: string, localPort?: number, localFamily?: string, remoteAddress?: string, remotePort?: number, remoteFamily?: string }) => void
  connection: (call: FreeSwitchResponse, data: { uuid?: string, headers: StringMap, body: StringMap, data: StringMap }) => void
}

export class FreeSwitchServer extends FreeSwitchEventEmitter<keyof FreeSwitchServerEvents, FreeSwitchServerEvents> {
  public stats: {
    error: bigint
    drop: bigint
    connection: bigint
    connected: bigint
    connection_error: bigint
    connection_handled: bigint
    connection_not_handled: bigint
  } = {
      error: 0n,
      drop: 0n,
      connection: 0n,
      connected: 0n,
      connection_error: 0n,
      connection_handled: 0n,
      connection_not_handled: 0n
    }

  private readonly __server: net.Server
  private readonly logger: FreeSwitchServerLogger

  /**
   * Create a new Node.js server that will accept Event Socket connections from FreeSWITCH.
   * @param options.all_events request all events from FreeSWITCH. default: true
   * @param options.my_events filter out events not related to the current session. default: true
   * @param options.logger default: `console` Object
   */
  constructor (options?: FreeSwitchServerConstructorOptions) {
    options ??= {}
    super()
    this.logger = options.logger ?? console
    const allEvents = options.all_events ?? true
    const myEvents = options.my_events ?? true
    this.__server = new net.Server({
      noDelay: true,
      keepAlive: true
    })
    this.__server.on('error', (exception) => {
      this.stats.error++
      this.logger.error('FreeSwitchServer: server error', exception)
      this.emit('error', exception)
    })
    this.__server.on('drop', (data) => {
      this.stats.drop++
      this.logger.error('FreeSwitchServer: server drop', data)
      if (data == null) {
        this.emit('drop')
      } else {
        this.emit('drop', data)
      }
    })
    this.__server.on('connection', (socket) => {
      void (async (): Promise<void> => {
        this.stats.connection++
        try {
          this.logger.debug('FreeSwitchServer received connection')

          // Here starts our default request-listener.
          const call = new FreeSwitchResponse(socket, this.logger)
          const Unique_ID = 'Unique-ID'
          // Confirm connection with FreeSwitch.
          const connectResponse = (await call.connect())
          const data = connectResponse.body
          const uuid = data[Unique_ID]
          this.stats.connected++
          this.logger.debug('FreeSwitchServer received connection: connected', { uuid })
          if (uuid != null) {
            call.setUUID(uuid)
            if (myEvents) {
              // Restricting events using `filter` is required so that `event_json` will only obtain our events.
              await call.filter(Unique_ID, uuid)
            }
          }
          call.auto_cleanup()
          if (allEvents) {
            await call.event_json('ALL')
          } else {
            await call.event_json('CHANNEL_EXECUTE_COMPLETE', 'BACKGROUND_JOB')
          }
          this.logger.debug('FreeSwitchServer received connection: sending `connection` event', { uuid })
          if (this.emit('connection', call, { ...connectResponse, data, uuid })) {
            this.stats.connection_handled++
          } else {
            this.stats.connection_not_handled++
          }
        } catch (error) {
          this.stats.connection_error++
          this.logger.error('FreeSwitchServer: connection handling error', error)
          if (error instanceof Error) {
            this.emit('error', error)
          } else {
            this.emit('error', new Error(`${error}`))
          }
        }
      })()
    })
    this.__server.on('listening', () => {
      this.logger.debug('FreeSwitchServer listening', this.__server.address())
    })
    this.__server.on('close', () => {
      this.logger.debug('FreeSwitchServer closed')
    })
    this.logger.info('FreeSwitchServer: Ready to start Event Socket server, use listen() to start.')
  }

  async listen (options: { host?: string, port: number }): Promise<void> {
    const p = new Promise((resolve) => this.__server.once('listening', resolve))
    this.__server.listen(options)
    await p
  }

  async close (): Promise<void> {
    const p = new Promise((resolve) => this.__server.once('close', resolve))
    this.__server.close()
    await p
  }

  async getConnectionCount (): Promise<number> {
    return await new Promise((resolve, reject) => {
      this.__server.getConnections(function (err, count) {
        if (err != null) {
          reject(err)
        } else {
          resolve(count)
        }
      })
    })
  }

  getMaxConnections (): number { return this.__server.maxConnections }
}
