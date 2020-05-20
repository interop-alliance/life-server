const inquirer = require('inquirer')
const fs = require('fs-extra')
const questions = require('./options')
const camelize = require('camelize')
const util = require('util')
const path = require('path')

const DEFAULT_CONFIG_FILE = './config.dev.js'

function loadInitServer (program) {
  program
    .command('init-server')
    .description('initialize server DID and keys')
    .option(
      '-c, --config [config]',
      `set config file path. Default: ${DEFAULT_CONFIG_FILE}`,
      DEFAULT_CONFIG_FILE
    )
    .action(async (options) => {
      let config
      try {
        config = require(path.resolve(options.config))

        await initServer(config)
      } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
          console.log('ERROR', `Config file is not found at ${options.config}.`,
            'Run "npm run server init" if you have not done so already.')
        } else {
          console.error(error)
        }
        return 1
      }
    })
}

function loadInit (program) {
  program
    .command('init')
    .description('create server configuration file')
    .action(async (opts) => {
      let config
      try {
        const answers = await inquirer.prompt(questions)
        config = camelize(answers)

        const configPath = path.resolve(config.configFile)

        console.log('Generated config:', util.inspect(config))

        await fs.writeFile(configPath,
          'module.exports = ' + util.inspect(config))

        console.log('Wrote to:', configPath)
      } catch (error) {
        console.error('Error initializing a config file:', error)
      }

      try {
        await initServer(config)
      } catch (error) {
        console.error('Error generating server DID and keys:', error)
      }
    })
}

async function initServer (config) {
  const Ed25519KeyPair = require('ed25519-key-pair')
  const { CryptoLD } = require('crypto-ld')
  const cryptoLd = new CryptoLD()
  cryptoLd.use(Ed25519KeyPair)

  const { DidWebResolver } = require('@interop/did-web-resolver')

  const didWeb = new DidWebResolver({ cryptoLd })

  console.log('Initializing server, config:', config)
}

module.exports = {
  loadInit,
  loadInitServer
}
