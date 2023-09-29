declare module "esl" {
  type StringMap = { [key:string]: string };
  // List from https://github.com/signalwire/freeswitch/blob/master/src/switch_event.c#L137
  type EventName =
    | "CUSTOM"
    | "CLONE"
    | "CHANNEL_CREATE"
    | "CHANNEL_DESTROY"
    | "CHANNEL_STATE"
    | "CHANNEL_CALLSTATE"
    | "CHANNEL_ANSWER"
    | "CHANNEL_HANGUP"
    | "CHANNEL_HANGUP_COMPLETE"
    | "CHANNEL_EXECUTE"
    | "CHANNEL_EXECUTE_COMPLETE"
    | "CHANNEL_HOLD"
    | "CHANNEL_UNHOLD"
    | "CHANNEL_BRIDGE"
    | "CHANNEL_UNBRIDGE"
    | "CHANNEL_PROGRESS"
    | "CHANNEL_PROGRESS_MEDIA"
    | "CHANNEL_OUTGOING"
    | "CHANNEL_PARK"
    | "CHANNEL_UNPARK"
    | "CHANNEL_APPLICATION"
    | "CHANNEL_ORIGINATE"
    | "CHANNEL_UUID"
    | "API"
    | "LOG"
    | "INBOUND_CHAN"
    | "OUTBOUND_CHAN"
    | "STARTUP"
    | "SHUTDOWN"
    | "PUBLISH"
    | "UNPUBLISH"
    | "TALK"
    | "NOTALK"
    | "SESSION_CRASH"
    | "MODULE_LOAD"
    | "MODULE_UNLOAD"
    | "DTMF"
    | "MESSAGE"
    | "PRESENCE_IN"
    | "NOTIFY_IN"
    | "PRESENCE_OUT"
    | "PRESENCE_PROBE"
    | "MESSAGE_WAITING"
    | "MESSAGE_QUERY"
    | "ROSTER"
    | "CODEC"
    | "BACKGROUND_JOB"
    | "DETECTED_SPEECH"
    | "DETECTED_TONE"
    | "PRIVATE_COMMAND"
    | "HEARTBEAT"
    | "TRAP"
    | "ADD_SCHEDULE"
    | "DEL_SCHEDULE"
    | "EXE_SCHEDULE"
    | "RE_SCHEDULE"
    | "RELOADXML"
    | "NOTIFY"
    | "PHONE_FEATURE"
    | "PHONE_FEATURE_SUBSCRIBE"
    | "SEND_MESSAGE"
    | "RECV_MESSAGE"
    | "REQUEST_PARAMS"
    | "CHANNEL_DATA"
    | "GENERAL"
    | "COMMAND"
    | "SESSION_HEARTBEAT"
    | "CLIENT_DISCONNECTED"
    | "SERVER_DISCONNECTED"
    | "SEND_INFO"
    | "RECV_INFO"
    | "RECV_RTCP_MESSAGE"
    | "SEND_RTCP_MESSAGE"
    | "CALL_SECURE"
    | "NAT"
    | "RECORD_START"
    | "RECORD_STOP"
    | "PLAYBACK_START"
    | "PLAYBACK_STOP"
    | "CALL_UPDATE"
    | "FAILURE"
    | "SOCKET_DATA"
    | "MEDIA_BUG_START"
    | "MEDIA_BUG_STOP"
    | "CONFERENCE_DATA_QUERY"
    | "CONFERENCE_DATA"
    | "CALL_SETUP_REQ"
    | "CALL_SETUP_RESULT"
    | "CALL_DETAIL"
    | "DEVICE_STATE"
    | "TEXT"
    | "SHUTDOWN_REQUESTED"
    | "ALL";

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

  class FreeSwitchUnhandledContentTypeError extends Error {
    content_type: string;
  }

  class FreeSwitchMissingContentTypeError extends Error {
    content_type: string;
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
    on(event:'error.missing-content-type', cb:(err:FreeSwitchMissingContentTypeError) => void) : void;
    on(event:'error.unhandled-content-type', cb:(err:FreeSwitchUnhandledContentTypeError) => void) : void;
    on(event:'error.invalid-json', cb:(err:Error) => void) : void;
    on(event:'cleanup_linger', cb:() => void) : void;
    on(event:'freeswitch_log_data', cb:(data:{ headers: StringMap, body: string }) => void) : void;
    on(event:'freeswitch_disconnect_notice', cb:(data:{ headers: StringMap, body: string }) => void) : void;
    on(event:'freeswitch_rude_rejection', cb:(data:{ headers: StringMap, body: string }) => void) : void;
    // May receive FreeSWITCH events (`CUSTOM`, etc)
    on(event:EventName, cb:(data:{ headers: StringMap, body: StringMap }) => void) : void;
    // May also receive `freeswitch_<content_type>` — these are errors, though,
    // we should support all content-types reported by mod_event_socket at this
    // time.
    // on(event:string, cb:(data:{ headers: StringMap, body: string }) => void) : void;
  }

  type Logger = (msg:string,data?:unknown) => void;

  class FreeSwitchServer {
    constructor(options?: {
      all_events?: boolean, // default true
      my_events?: boolean, // default true
      logger?: { debug: Logger, info: Logger, error: Logger }, // default console
    });
    stats: {
      error: BigInt;
      drop: BigInt;
      connection: BigInt;
      connected: BigInt;
      connection_error: BigInt;
    };
    on(event:'error', cb:(exception:Error) => void) : void;
    on(event:'drop', cb:(data:{localAddress:string,localPort:number,localFamily:string,remoteAddress:string,remotePort:number,remoteFamily:string}) => void) : void;
    on(event:'connection', cb:(call:FreeSwitchResponse, data:{ uuid: string, headers: StringMap, body: StringMap, data: StringMap }) => void) : void;
    listen(options:{ host?: string, port: number }) : Promise<void>;
    close() : Promise<void>;
    getConnectionCount() : Promise<number>;
  }

  class FreeSwitchClient {
    constructor(options?: {
      host?: string, port: number, password?: string
    });
    connect(): void;
    end(): Promise<void>;
    on(event:'reconnecting', cb:(retry:number) => void) : void;
    on(event:'error', cb:(exception:Error) => void) : void;
    on(event:'connect', cb:(call:FreeSwitchResponse) => void) : void;
    on(event:'warning', cb:(data:unknown) => void) : void;
    on(event:'end', cb:() => void) : void;
  }
}
