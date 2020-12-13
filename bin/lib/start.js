'use strict'

const path = require('path')
const { createServer } = require('../../')

const DEFAULT_CONFIG_FILE = './config.default.js'

module.exports = (program) => {
  program
    .command('start')
    .description('Start Life Server')

    .option(
      '-c, --config [config]',
      `set config file path. Default: ${DEFAULT_CONFIG_FILE}`,
      DEFAULT_CONFIG_FILE
    )

  // options
  //   .forEach((option) => {
  //     const configName = option.name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  //     const snakeCaseName = configName.replace(/([A-Z])/g, '_$1')
  //     const envName = `SOLID_${snakeCaseName.toUpperCase()}`
  //
  //     let name = '--' + option.name
  //     if (!option.flag) {
  //       name += ' [value]'
  //     }
  //
  //     if (process.env[envName]) {
  //       const raw = process.env[envName]
  //       const envValue = /^(true|false)$/.test(raw) ? raw === 'true' : raw
  //
  //       start.option(name, option.help, envValue)
  //     } else {
  //       start.option(name, option.help)
  //     }
  //   })

    .action(async (options) => {
      let config
      try {
        const configPath = path.resolve(options.config)
        console.log('Config path:', configPath)
        config = require(configPath)
      } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
          console.log('ERROR', `Config file is not found at ${options.config}.`,
            'Run "npm run init" if you have not done so already.')
        } else {
          console.error(error)
        }
        return 1
      }

      return startServer(config)
    })
}

async function startServer (argv) {
  // Signal handling (e.g. CTRL+C)
  if (process.platform !== 'win32') {
    // Signal handlers don't work on Windows.
    process.on('SIGINT', () => {
      console.log('\nServer stopped.')
      process.exit()
    })
  }

  let app
  try {
    app = await createServer(argv)
  } catch (e) {
    if (e.code === 'EACCES') {
      if (e.syscall === 'mkdir') {
        console.log('ERROR', `You need permissions to create '${e.path}' folder`)
      } else {
        console.log('ERROR', 'You need root privileges to start on this port')
      }
      return 1
    }
    if (e.code === 'EADDRINUSE') {
      console.log('ERROR', 'The port ' + argv.port + ' is already in use')
      return 1
    }
    console.log('ERROR', e.message)
    return 1
  }
  app.listen(argv.port, () => {
    console.log(`Life Server (${argv.version}) ` +
      `running on \u001b[4mhttps://localhost:${argv.port}/\u001b[0m`)
    console.log('Press <ctrl>+c to stop')
  })
}
