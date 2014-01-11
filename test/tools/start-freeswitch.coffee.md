    child_process = require 'child_process'
    path = require 'path'
    fs = require 'fs'

## Recursively remove a directory and its content.

    remove_dir = (dir) ->
      files = fs.readdirSync dir
      files.map (name) ->
        remove path.join dir, name
      fs.rmdirSync dir

## Remove a filesystem location; if it is a directory, recursively remove it.

    remove = (name) ->
      s = fs.statSync name
      if s.isDirectory()
        remove_dir name
      else
        fs.unlinkSync name

    module.exports = (cfgname,dir) ->
      if typeof dir is 'function'
        [dir,cb] = [null,dir]
      dir ?= path.join process.cwd(), "tmp-#{process.pid}"

      fs.mkdirSync dir

      c = child_process.spawn 'freeswitch', [
        '-nf'
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
        '-mod', '/usr/lib/freeswitch/mod'
        '-cfgname', cfgname
      ], stdio: 'pipe'

      c.on 'error', (err) ->
        console.log "FreeSwitch startup failed: #{err}"

      log = (s) ->
        s.resume()
        s.output = new Buffer 0
        s.on 'data', (data) ->
          s.output = Buffer.concat [s.output, data]

      log c.stdout
      log c.stderr

      c.on 'exit', (code,signal) ->
        console.log "FreeSwitch stopped: code=#{code} signal=#{signal}"
        # if code isnt 0
        process.stdout.write c.stdout.output
        process.stderr.write c.stderr.output

      process.on 'exit', ->
        remove_dir dir
        c.kill 'SIGKILL'
        c = null

      return c
