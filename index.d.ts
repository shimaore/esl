declare module "esl" {
  type StringMap = { [key:string]: string };
  declare class FreeSwitchParserError extends Error {
    headers: StringMap;
    body: StringMap;
  }
  declare class FreeSwitchError extends Error {
    res: StringMap;
    args: StringMap;
  }
  declare class FreeSwitchTimeout extends Error {
    timeout: number;
    text: string;
  }
  type ResponseLogger = (msg: string, { ref: string, [key:string]: unknown }) -> void;
  type SendResult = Promise<FreeSwitchError | { headers: StringMap, body: StringMap }>;
  declare class FreeSwitchResponse {
    // constructor: (socket: Socket, logger: { debug: ResponseLogger, info: ResponseLogger, error: ResponseLogger });
    stats: {
      missing_content_type: bignum;
      auth_request: bignum;
      command_reply: bignum;
      events: bignum;
      json_parse_errors: bignum;
      log_data: bignum;
      disconnect: bignum;
      api_responses: bignum;
      rude_rejections: bignum;
      unhandled: bignum;
    };
    readonly closed: boolean;
    setUUID: (uuid:string) -> void;
    uuid: () -> string;
    ref: () -> string;
    default_event_timeout: () -> number;
    default_send_timeout: () -> number;
    default_command_timeout: () -> number;

    // timeout defaults to `default_send_timeout`
    send: (command: string, args?: StringMap, timeout?: number ) -> SendResult;
    end: () -> void;
    api: (command: string, timeout?: number) -> Promise<FreeSwitchError | { uuid: string, body: StringMap, headers: StringMap }>;
    bgapi: (command: string, timeout?: number ) -> Promise<FreeSwitchError | { body: StringMap }>;

    event_json: async (events...:string) -> SendResult;
    nixevent: async (events...:string) -> SendResult;
    noevents: () -> SendResult;
    filter: (header:string, value:string) -> SendResult;
    filter_delete: (header:string, value:string) -> SendResult;
    sendevent: (event_name:string, args:StringMap) -> SendResult;
    auth: (password:string) -> SendResult;
    connect: () -> SendResult;
    linger: () -> SendResult;
    exit: () -> SendResult;
    log: (level:number) -> SendResult;
    nolog: () -> SendResult;

    sendmsg_uuid: (uuid:string,command:string,args:StringMap) -> SendResult;
    sendmsg: (command:string,args:StringMap) -> SendResult;
    execute_uuid: (uuid:string,app_name:string,app_arg:string,loops?:number,event_uuid?:string) -> SendResult;
    command_uuid: (uuid:string,app_name:string,app_arg:string,timeout?:number) -> SendResult;
    hangup_uuid: (uuid:string,hangup_cause?:string) -> SendResult;
    unicast_uuid: (uuid:string,args:{ 'local-ip': string, 'local-port': number: 'remote-ip': string, 'remote-port': number, transport: 'tcp'|'udp', flags?:'native') -> SendResult;

    execute: (app_name:string,app_arg:string) -> SendResult;
    commnad: (app_name:string,app_arg:string) -> SendResult;
    hangup: (hangup_cause?:string) -> SendResult;
    unicast: (args: StringMap) -> SendResult;

    // Not listing internally-processed events.
    on: ('socket.close', () -> void) -> void;
    on: ('socket.error', (err:Error) -> void) -> void;
    on: ('socket.write', (err:Error) -> void) -> void;
    on: ('socket.end', (err:Error) -> void) -> void;
    on: ('error.missing-content-type', (err:FreeSwitchParserError) -> void) -> void;
    on: ('error.unhandled-content-type', (err:FreeSwitchParserError) -> void) -> void;
    on: ('error.invalid-json', (err:Error) -> void) -> void;
    on: ('cleanup_linger', () -> void) -> void;
    on: ('freeswitch_log_data', ({ headers: StringMap, body: StringMap }) -> void) -> void;
    on: ('freeswitch_disconnect_notice', ({ headers: StringMap, body: StringMap }) -> void) -> void;
    on: ('freeswitch_rude_rejection', ({ headers: StringMap, body: StringMap }) -> void) -> void;
    // May receive FreeSWITCH events (`CUSTOM`, etc) or `freeswitch_<content_type>`.
    on: (event:string, ({ headers: StringMap, body: StringMap }) -> void) -> void;
  }
  type Logger = (msg:string,data?:unknown) -> void;
  declare class FreeSwitchServer {
    constructor(options: {
      all_events?: boolean,
      my_events?: boolean,
      logger?: { debug: Logger, info: Logger, error: Logger }
    });
    stats: {
      error: bignum;
      drop: bignum;
      connection: bignum;
      connected: bignum;
      connection_error: bignum;
    };
    on: (type:'error', (exception:Error) -> void | Promise<void>) -> void;
    on: (type:'drop', (data:unknwon) -> void | Promise<void>) -> void;
    on: (type:'connection', (call:FreeSwitchResponse, { uuid: string, headers: StringMap, body: StringMap, data: StringMap }) -> void | Promise<void>) -> void;
    listen: ({ host?: string, port: number }) -> Promise<void>;
    close: () -> Promise<void>;
    getConnectionCount: () -> Promise<number>;
  };

  declare class FreeSwitchClient {
    // FIXME TBD
  };
}
