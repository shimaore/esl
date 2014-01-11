    module.exports = (cfgname,dir) ->
      child_process = require 'child_process'
      dir ?= process.cwd()
      child_process.spawn 'freeswitch', [
        '-nc'
        '-nosql'
        '-nonat'
        '-nonatmap'
        '-nocal'
        '-nort'
        '-base', dir
        '-conf', dir
        '-log', dir
        '-run', dir
        '-db', dir
        '-scripts', dir
        '-temp', dir
        '-cfgname', cfgname
      ]
