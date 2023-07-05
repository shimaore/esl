    import { spawn } from 'node:child_process'
    import { once } from 'node:events'
    import { mkdir } from 'node:fs/promises'

    fs_client = null
    fs_server = null

    common_options = [
      '-nf', '-c',
      '-nosql', '-nonat', '-nocal', '-nort',
      '-conf', '/opt/test',
    ]

    export start = () =>
      await start_client()
      await start_server()

    export start_client = () =>
      console.log 'Starting FS with client profile'
      await mkdir '/tmp/client'
      fs_client = spawn '/usr/bin/freeswitch', [
          ...common_options,
          '-cfgname', '0001-client.xml',
          '-log', '/tmp/client',
          '-db', '/tmp/client',
        ],
        {
          stdio: ['ignore', 'inherit', 'inherit'],
        }
      fs_client.on 'error', (error) ->
        console.error 'fs_client error', error
        return
      fs_client.once 'exit', (code,signal) ->
        console.error 'fs_client exit', { code, signal }
        stop()
        process.exit 1 unless code is 0
        return
      await once fs_client, 'spawn'

    export start_server = () =>
      console.log 'Starting FS with server profile'
      await mkdir '/tmp/server'
      fs_server = spawn '/usr/bin/freeswitch', [
          ...common_options,
          '-cfgname', '0001-server.xml',
          '-log', '/tmp/server',
          '-db', '/tmp/server',
        ],
        {
          stdio: ['ignore', 'inherit', 'inherit'],
        }
      fs_server.on 'error', (error) ->
        console.error 'fs_server error', error
        return
      fs_server.once 'exit', (code,signal) ->
        console.error 'fs_server exit', { code, signal }
        stop()
        process.exit 1 unless code is 0
        return
      await once fs_server, 'spawn'
      return

    export stop = () =>
      fs_client?.kill()
      fs_server?.kill()
      return
