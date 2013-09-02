(function () {
  'use strict';

  var esl = require('../lib/esl');

  esl.client( function (eslResponse) {
    eslResponse.sequence([
      /*
        function () {
          var that = this;
          this.api('strepoch 2013-01-01').then(
            function() {
              console.log("--- Callback 1: " + this.body);
              return that;
            }
          );
          return this;
        }
      , */
        function () {
          return this.api('strepoch 2012-01-01');
        }
      , function() {
          console.log("--- Callback 2: " + this.body);
        }
      , function() { this.exit() }
      ]);
    }).connect(8021, '127.0.0.1');
}());
