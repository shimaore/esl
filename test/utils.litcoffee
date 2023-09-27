    import { spawn } from 'node:child_process'
    import { once } from 'node:events'
    import { mkdir, rm } from 'node:fs/promises'
    import { ulid } from 'ulidx'

    fs_client = null
    fs_server = null

    common_options = [
      '-nf' # No forking
      '-c'  # Console and foreground
      '-nosql'
      '-nonat' # Disable auto nat detection
      '-nocal' # Disable clock calibration
      '-nort'
      '-conf', '/opt/test'
    ]

    export start = () =>
      await start_client()
      await start_server()

    export start_client = () =>
      dir = "/tmp/client-#{ulid()}"
      console.log 'Starting FS with client profile'
      await mkdir dir
      fs_client = spawn '/usr/bin/freeswitch', [
          ...common_options
          '-cfgname', 'client.xml'
          '-log', dir
          '-db', dir
        ],
        {
          stdio: ['ignore', 'inherit', 'inherit'],
        }
      fs_client.on 'error', (error) ->
        console.error 'fs_client error', error
        return
      fs_client.once 'exit', (code,signal) ->
        console.error 'fs_client exit', { code, signal }
        try await rm dir, recursive: true, force: true
        process.exit 1 unless code is 0
        return
      await once fs_client, 'spawn'
      console.info 'fs_client spawned'
      return

    export start_server = () =>
      dir = "/tmp/server-#{ulid()}"
      console.log 'Starting FS with server profile'
      await mkdir dir
      fs_server = spawn '/usr/bin/freeswitch', [
          ...common_options,
          '-cfgname', 'server.xml',
          '-log', dir
          '-db', dir
        ],
        {
          stdio: ['ignore', 'inherit', 'inherit'],
        }
      fs_server.on 'error', (error) ->
        console.error 'fs_server error', error
        return
      fs_server.once 'exit', (code,signal) ->
        console.error 'fs_server exit', { code, signal }
        try await rm dir, recursive: true, force: true
        process.exit 1 unless code is 0
        return
      await once fs_server, 'spawn'
      console.info 'fs_server spawned'
      return

    export stop = () =>
      fs_client?.kill()
      fs_server?.kill()
      return
