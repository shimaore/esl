Client and server for FreeSwitch events socket that follow Node.js conventions.

Install
-------

    npm install esl

Documentation
-------------

  http://shimaore.github.com/esl/esl.html

Examples
--------

* Client example: [send commands](https://github.com/shimaore/ccnq3/blob/master/applications/freeswitch/agents/freeswitch.coffee)
* Server example: [voicemail application](https://github.com/shimaore/ccnq3/tree/master/applications/voicemail/node/)
* Also see under examples/ in the source for contributed examples.

Alternative
-----------

This module should be more convenient for you if you've already coded for Node.js and are used to its [`http` interface](http://nodejs.org/api/http.html).
If you are coming from the FreeSwitch side of the world you might be used to the Event Socket Library specification, in which case you might want to try [node-esl](https://github.com/englercj/node-esl).
