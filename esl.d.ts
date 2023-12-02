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
    command(app_name:string,app_arg:string,timeout?:number) : SendResult;
    hangup(hangup_cause?:string) : SendResult;
    unicast(args: {'local-ip':string, 'local-port':number, 'remote-ip':string, 'remote-port':number, transport:'tcp'|'udp', flags?:'native'}) : SendResult;

  }


  class FreeSwitchServer {
    constructor(options?: {
      all_events?: boolean, // default true
      my_events?: boolean, // default true
      logger?: { debug: Logger, info: Logger, error: Logger }, // default console
    });
  }

  class FreeSwitchClient {
    constructor(options?: {
      host?: string, port: number, password?: string, logger?: { debug: Logger, info: Logger, error: Logger }, // default console
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
