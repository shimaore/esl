// Example code contributed by Fraser Redmond
// WARNING: this code still uses the old (0.3.x) version of the module.
// TODO: Migrate to the new (2.0) version.

var fsServer = '127.0.0.1',
    fsPass   = 'clueCon',
    fsPort   = 8021;

var fsEsl = require('esl'),
    io    = require('socket.io').listen(8080);

io.enable('browser client minification');  // send minified client
io.enable('browser client etag');          // apply etag caching logic based on version number
io.enable('browser client gzip');          // gzip the file
io.set('log level', 1);                    // reduce logging
io.set('transports', [                     // enable all transports (optional if you want flashsocket)
    'websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling'
]);

function fsConnect (socket, cmd, callbackFunc, args) {
    fsConnClosed(socket);
    socket.fsClient = fsEsl.createClient();
    socket.fsClient.on('close', function(){fsConnClosed(socket)});

    socket.fsClient.on('esl_auth_request', function(callbackObj) {
        return callbackObj.auth(fsPass, function(callbackObj) {
            socket.fsConn = callbackObj;
            fsCommand(socket, cmd, callbackFunc, args);
        });
    });

    return socket.fsClient.connect(fsPort, fsServer);
}

function fsConnClosed (socket) {
    if (socket.fsClient) {
        socket.fsClient.end();
    }
    socket.fsConn = false;
    socket.fsClient = false;
}

function fsCommand (socket, cmd, callbackFunc, args) {
    if (!socket.fsConn || !socket.fsClient) {
        fsConnect(socket, cmd, callbackFunc, args); //If connection doesn't already exist, then create it, and when it's created it will call this function with the same params again
    } else {
        socket.fsConn.api(cmd, function(callback) {
            //console.log('text:' + callback.body);
            if (callbackFunc) {
                console.log(cmd)
                callbackFunc(callback.body, socket, args);
            }
        });
    }
}

function parseStrToArray (textToParse, columnDelimiter, returnNameValPairs) {
    var headerLines, headers, line, name, nameValPair;
    headerLines = textToParse.split("\n");
    if (returnNameValPairs) {
        headers = {};
    } else {
        headers = [];
    }
    for (var i = 0; i < headerLines.length; i++) {
        if (returnNameValPairs) {
            nameValPair = headerLines[i].split(columnDelimiter, 2)
            headers[nameValPair[0]] = nameValPair[1];
        } else {
            headers[i] = headerLines[i].split(columnDelimiter);
        }
    }
    if (returnNameValPairs && headers['Reply-Text'] && headers['Reply-Text'][0] === '%') {
        for (name in headers) {
            headers[name] = querystring.unescape(headers[name]);
        }
    }
    return headers;
}





function parseUuids (responseStr, socket, messageObj) {
    var uuidArr = parseStrToArray(responseStr, ',', false);
    //more code here...
}

io.sockets.on('connection', function(socket) {
    console.log('connected')
    socket.fsClient = false,
    socket.fsConn   = false,

    socket.on('message', function(messageObj){
        fsCommand(socket, "show channels like " + messageObj.extnNum, parseUuids, messageObj);
    });

    socket.on('disconnect', function(){
        fsConnClosed(socket);
    });
});

process.on('exit', function () {
    conn.closeSync();
});
