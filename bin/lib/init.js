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
        console.error(error)
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

function didParamsFrom (config) {
  let url, serverFolder
  const keyStorage = path.resolve(config.dbPath, 'server')
  if (config.multiuser) {
    url = config.serverUri + '/.well-known/did.json'
    serverFolder = path.resolve(config.root, '.well-known')
  } else {
    url = config.serverUri + '/server/did.json'
    serverFolder = path.resolve(config.root, 'server')
  }

  const didFilename = path.resolve(serverFolder, 'did.json')

  return { keyStorage, url, serverFolder, didFilename }
}

const publicAcl = `
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#public>
    a acl:Authorization;
    acl:agentClass foaf:Agent;
    acl:accessTo <./>;
    acl:defaultForNew <./>;
    acl:mode acl:Read.
`

async function initServer (config) {
  const { generateDid } = require('../../src/accounts/dids')
  const { storeDidKeys } = require('../../src/storage/storage-manager')

  console.log('Initializing server, config:', config)

  const { keyStorage, url, serverFolder, didFilename } = didParamsFrom(config)
  const { didDocument, didKeys } = await generateDid({ url })
  console.log(`DID generated: "${didDocument.id}".`)

  // write did document
  console.log('Writing acl:', path.resolve(serverFolder, '.acl'))
  await fs.ensureDir(serverFolder)
  await fs.writeFile(path.resolve(serverFolder, '.acl'), publicAcl)
  await fs.writeFile(didFilename, JSON.stringify(didDocument, null, 2))
  console.log(`Server DID Document written to "${didFilename}".`)

  // export keys
  await storeDidKeys({ didKeys, did: didDocument.id, dir: keyStorage })
  console.log(`Keys written to "${keyStorage}".`)
}

module.exports = {
  initServer,
  loadInit,
  loadInitServer
}
