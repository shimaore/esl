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

type StringMap = { [key:string]: string };
type Logger = (msg:string,data?:unknown) => void;

type FreeSwitchLogger = {
  debug: Logger,
  info: Logger,
  error: Logger,
}

type FreeSwitchServerConstructorOptions = {
  all_events?: boolean, // default true
  my_events?: boolean, // default true
  logger?: FreeSwitchLogger // default console
}

export declare interface FreeSwitchServer {
  on(event:'error', cb:(exception:Error) => void) : this;
  on(event:'drop', cb:(data:{localAddress:string,localPort:number,localFamily:string,remoteAddress:string,remotePort:number,remoteFamily:string}) => void) : this;
  on(event:'connection', cb:(call:FreeSwitchResponse, data:{ uuid: string, headers: StringMap, body: StringMap, data: StringMap }) => void) : this;
}

export class FreeSwitchServer extends EventEmitter {
  public stats: {
      error: bigint;
      drop: bigint;
      connection: bigint;
      connected: bigint;
      connection_error: bigint;
  } = {
      error: 0n,
      drop: 0n,
      connection: 0n,
      connected: 0n,
      connection_error: 0n
    }
  private readonly __server : net.Server
  private readonly logger : FreeSwitchLogger

  constructor(options? : FreeSwitchServerConstructorOptions ) {
    options ??= {}
    super();
    this.logger = options.logger ?? console;
    const all_events = options.all_events ?? true;
    const my_events = options.my_events ?? true;
    this.__server = new net.Server({
      noDelay: true,
      keepAlive: true
    });
    this.__server.on('error', (exception) => {
      this.stats.error++;
      this.logger.error('FreeSwitchServer: server error', exception);
      this.emit('error', exception);
    });
    this.__server.on('drop', (data) => {
      this.stats.drop++;
      this.logger.error('FreeSwitchServer: server drop', data);
      this.emit('drop', data);
    });
    this.__server.on('connection', async(socket) => {
      this.stats.connection++;
      this.logger.debug('FreeSwitchServer received connection');
      try {
        // Here starts our default request-listener.
        const call = new FreeSwitchResponse(socket, this.logger);
        const Unique_ID = 'Unique-ID';
        // Confirm connection with FreeSwitch.
        const connect_response = (await call.connect());
        const data = connect_response.body;
        const uuid = data[Unique_ID];
        this.stats.connected++;
        this.logger.debug('FreeSwitchServer received connection: connected', {uuid});
        if (uuid != null) {
          call.setUUID(uuid);
        }
        if (my_events) {
          // Restricting events using `filter` is required so that `event_json` will only obtain our events.
          await call.filter(Unique_ID, uuid);
        }
        await call.auto_cleanup();
        if (all_events) {
          await call.event_json('ALL');
        } else {
          await call.event_json('CHANNEL_EXECUTE_COMPLETE', 'BACKGROUND_JOB');
        }
        this.logger.debug('FreeSwitchServer received connection: sending `connection` event', {uuid});
        this.emit('connection', call, {...connect_response, data, uuid});
      } catch (error) {
        this.stats.connection_error++;
        this.logger.error('FreeSwitchServer: connection handling error', error);
        this.emit('error', error);
      }
    });
    this.logger.info('FreeSwitchServer: Ready to start Event Socket server, use listen() to start.');
    return;
  }

  async listen(options:{ host?: string, port: number }) : Promise<void> {
    const p = once(this.__server, 'listening')
    this.__server.listen(options);
    await p;
  }

  async close() : Promise<void> {
    const p = once(this.__server, 'close')
    this.__server.close();
    await p;
  }

  getConnectionCount() : Promise<number> {
    return new Promise((resolve, reject) => {
      this.__server.getConnections(function(err, count) {
        if (err) {
          return reject(err);
        } else {
          return resolve(count);
        }
      });
    });
  }

};

import net from 'node:net';

import EventEmitter, {
  once
} from 'node:events';

import {
  FreeSwitchResponse
} from './response.js';

import assert from 'node:assert';
