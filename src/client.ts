// Client
// ======

// Client mode is used to place new calls or take over existing calls.
// Contrarily to the server which will handle multiple socket connections over its lifetime, a client only handles one socket, so only one `FreeSwitchResponse` object is needed as well.

const default_password = 'ClueCon';

export class FreeSwitchClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger ?? console;
    assert('function' === typeof this.logger.debug);
    assert('function' === typeof this.logger.info);
    assert('function' === typeof this.logger.error);
    this.options = {
      host: '127.0.0.1',
      port: 8021,
      password: default_password,
      ...options
    };
    this.current_call = null;
    this.running = true;
    this.retry = 200;
    this.attempt = 0n;
    this.logger.info('FreeSwitchClient: Ready to start Event Socket client, use connect() to start.');
    return;
  }

  /**
   * @return undefined
   */
  connect() {
    var error, ref, socket;
    if (!this.running) {
      this.logger.debug('FreeSwitchClient::connect: not running, aborting', {options: this.options, attempt: this.attempt});
      return;
    }
    this.attempt++;
    this.logger.debug('FreeSwitchClient::connect', {options: this.options, attempt: this.attempt, retry: this.retry});
    // Destroy any existing socket
    if ((ref = this.current_call) != null) {
      ref.end();
    }
    socket = new net.Socket();
    this.current_call = new FreeSwitchResponse(socket, this.logger);
    socket.once('connect', async() => {
      var error, ref1, ref2, ref3, ref4;
      try {
        // Normally when the client connects, FreeSwitch will first send us an authentication request. We use it to trigger the remainder of the stack.
        await ((ref1 = this.current_call) != null ? ref1.onceAsync('freeswitch_auth_request', 20_000, 'FreeSwitchClient expected authentication request') : void 0);
        await ((ref2 = this.current_call) != null ? ref2.auth(this.options.password) : void 0);
        await ((ref3 = this.current_call) != null ? ref3.auto_cleanup() : void 0);
        await ((ref4 = this.current_call) != null ? ref4.event_json('CHANNEL_EXECUTE_COMPLETE', 'BACKGROUND_JOB') : void 0);
      } catch (error1) {
        error = error1;
        this.logger.error('FreeSwitchClient: connect error', error);
        this.emit('error', error);
      }
      if (this.running && this.current_call) {
        this.emit('connect', this.current_call);
      }
    });
    socket.once('error', (error) => {
      var code;
      code = 'code' in error ? error.code : void 0;
      if (this.retry < 5000) {
        if (code === 'ECONNREFUSED') {
          this.retry = Math.floor((this.retry * 1200) / 1000);
        }
      }
      this.logger.error('FreeSwitchClient::connect: client received `error` event', {attempt: this.attempt, retry: this.retry, error, code});
      if (this.running) {
        this.emit('reconnecting', this.retry);
        setTimeout((() => {
          return this.connect();
        }), this.retry);
      }
    });
    socket.once('end', () => {
      this.logger.debug('FreeSwitchClient::connect: client received `end` event (remote end sent a FIN packet)', {attempt: this.attempt, retry: this.retry});
      if (this.running) {
        this.emit('reconnecting', this.retry);
        setTimeout((() => {
          return this.connect();
        }), this.retry);
      }
    });
    socket.on('warning', (data) => {
      this.emit('warning', data);
    });
    try {
      this.logger.debug('FreeSwitchClient::connect: socket.connect', {options: this.options, attempt: this.attempt, retry: this.retry});
      socket.connect(this.options);
    } catch (error1) {
      error = error1;
      this.logger.error('FreeSwitchClient::connect: socket.connect', {error});
    }
  }

  async end() {
    this.logger.debug("FreeSwitchClient::end: end requested by application.", {attempt: this.attempt});
    this.emit('end');
    this.running = false;
    if (this.current_call != null) {
      await this.current_call.end();
      this.current_call = null;
    }
  }

};

import net from 'node:net';

import EventEmitter from 'node:events';

import {
  FreeSwitchResponse
} from './response.js';

import assert from 'node:assert';
