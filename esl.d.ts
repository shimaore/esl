declare module "esl" {
  type StringMap = { [key:string]: string };
  class FreeSwitchParserError extends Error {
    headers: StringMap;
    body: StringMap;
  }
  class FreeSwitchError extends Error {
    res: StringMap;
    args: StringMap;
  }
  class FreeSwitchTimeout extends Error {
    timeout: number;
    text: string;
  }
  type ResponseLogger = (msg: string, data: { ref: string, [key:string]: unknown }) => void;
  type SendResult = Promise<FreeSwitchError | { headers: StringMap, body: StringMap }>;
  class FreeSwitchResponse {
    // constructor(socket: Socket, logger: { debug: ResponseLogger, info: ResponseLogger, error: ResponseLogger });
    stats: {
      missing_content_type: BigInt;
      auth_request: BigInt;
      command_reply: BigInt;
      events: BigInt;
      json_parse_errors: BigInt;
      log_data: BigInt;
      disconnect: BigInt;
      api_responses: BigInt;
      rude_rejections: BigInt;
      unhandled: BigInt;
    };
    readonly closed: boolean;
    setUUID(uuid:string) : void;
    uuid() : string;
    ref() : string;
    default_event_timeout() : number;
    default_send_timeout() : number;
    default_command_timeout() : number;

    // timeout defaults to `default_send_timeout`
    send(command: string, args?: StringMap, timeout?: number ) : SendResult;
    end() : void;
    /**
     * @throws {FreeSwitchError}
     */
    api(command: string, timeout?: number) : Promise<FreeSwitchError | { uuid: string, body: StringMap, headers: StringMap }>;
    /**
     * @throws {FreeSwitchError}
     */
    bgapi(command: string, timeout?: number ) : Promise<FreeSwitchError | { body: StringMap }>;

    event_json(...events:string[]) : SendResult;
    nixevent(...events:string[]) : SendResult;
    noevents() : SendResult;
    filter(header:string, value:string) : SendResult;
    filter_delete(header:string, value:string) : SendResult;
    sendevent(event_name:string, args:StringMap) : SendResult;
    auth(password:string) : SendResult;
    connect() : SendResult;
    linger() : SendResult;
    exit() : SendResult;
    log(level:number) : SendResult;
    nolog() : SendResult;

    sendmsg_uuid(uuid:string,command:string,args:StringMap) : SendResult;
    sendmsg(command:string,args:StringMap) : SendResult;
    execute_uuid(uuid:string,app_name:string,app_arg:string,loops?:number,event_uuid?:string) : SendResult;
    command_uuid(uuid:string,app_name:string,app_arg:string,timeout?:number) : SendResult;
    hangup_uuid(uuid:string,hangup_cause?:string) : SendResult;
    unicast_uuid(uuid:string,args:{'local-ip':string, 'local-port':number, 'remote-ip':string, 'remote-port':number, transport:'tcp'|'udp', flags?:'native'}) : SendResult;

    execute(app_name:string,app_arg:string) : SendResult;
    commnad(app_name:string,app_arg:string) : SendResult;
    hangup(hangup_cause?:string) : SendResult;
    unicast(args: StringMap) : SendResult;

    // Not listing internally-processed events.
    on(event:'socket.close', cb:() => void) : void;
    on(event:'socket.error', cb:(err:Error) => void) : void;
    on(event:'socket.write', cb:(err:Error) => void) : void;
    on(event:'socket.end', cb:(err:Error) => void) : void;
    on(event:'error.missing-content-type', cb:(err:FreeSwitchParserError) => void) : void;
    on(event:'error.unhandled-content-type', cb:(err:FreeSwitchParserError) => void) : void;
    on(event:'error.invalid-json', cb:(err:Error) => void) : void;
    on(event:'cleanup_linger', cb:() => void) : void;
    on(event:'freeswitch_log_data', cb:(data:{ headers: StringMap, body: StringMap }) => void) : void;
    on(event:'freeswitch_disconnect_notice', cb:(data:{ headers: StringMap, body: StringMap }) => void) : void;
    on(event:'freeswitch_rude_rejection', cb:(data:{ headers: StringMap, body: StringMap }) => void) : void;
    // May receive FreeSWITCH events (`CUSTOM`, etc) or `freeswitch_<content_type>`.
    on(event:string, cb:(data:{ headers: StringMap, body: StringMap }) => void) : void;
  }
  type Logger = (msg:string,data?:unknown) => void;
  class FreeSwitchServer {
    constructor(options: {
      all_events?: boolean,
      my_events?: boolean,
      logger?: { debug: Logger, info: Logger, error: Logger }
    });
    stats: {
      error: BigInt;
      drop: BigInt;
      connection: BigInt;
      connected: BigInt;
      connection_error: BigInt;
    };
    on(type:'error', cb:(exception:Error) => void | Promise<void>) : void;
    on(type:'drop', cb:(data:{localAddress:string,localPort:number,localFamily:string,remoteAddress:string,remotePort:number,remoteFamily:string}) => void | Promise<void>) : void;
    on(type:'connection', cb:(call:FreeSwitchResponse, data:{ uuid: string, headers: StringMap, body: StringMap, data: StringMap }) => void | Promise<void>) : void;
    listen(options:{ host?: string, port: number }) : Promise<void>;
    close() : Promise<void>;
    getConnectionCount() : Promise<number>;
  }

  class FreeSwitchClient {
    // FIXME TBD
  }
}
