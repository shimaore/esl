# Client example from the README

FS = require '../lib/fs-q'

fs_command = (cmd) ->
  client = FS.client()

  client.on 'freeswitch_connect', (pv) ->
      pv
      .then FS.api cmd
      .then FS.exit()
      .then FS.disconnect()

  client.connect(8021, '127.0.0.1')

fs_command "reloadxml"
