const fs = require('fs-extra')
const { URL } = require('url')

module.exports.loadAccounts = loadAccounts
module.exports.loadConfig = loadConfig
module.exports.loadUsernames = loadUsernames

function loadConfig (program, options) {
  let argv = {
    ...options,
    version: program.version()
  }
  const configFile = argv.configFile || './config.json'

  try {
    const file = fs.readFileSync(configFile)

    // Use flags with priority over config file
    const config = JSON.parse(file)
    argv = { ...config, ...argv }
  } catch (err) {
    // If config file was specified, but it doesn't exist, stop with error message
    if (typeof argv.configFile !== 'undefined') {
      if (!fs.existsSync(configFile)) {
        console.log('ERR', 'Config file ' + configFile + ' doesn\'t exist.')
        process.exit(1)
      }
    }

    // If the file exists, but parsing failed, stop with error message
    if (fs.existsSync(configFile)) {
      console.log('ERR', 'config file ' + configFile + ' couldn\'t be parsed: ' + err)
      process.exit(1)
    }

    // Legacy behavior - if config file does not exist, start with default
    // values, but an info message to create a config file.
    console.log('TIP', 'create a config.json: `$ solid init`')
  }

  return argv
}

/**
 *
 * @param root
 * @param [serverUri] If not set, hostname must be set
 * @param [hostname] If not set, serverUri must be set
 * @returns {*}
 */
function loadAccounts ({ root, serverUri, hostname }) {
  const files = fs.readdirSync(root)
  hostname = hostname || new URL(serverUri).hostname
  const isUserDirectory = new RegExp(`.${hostname}$`)
  return files
    .filter(file => isUserDirectory.test(file))
}

function loadUsernames ({ root, serverUri }) {
  const hostname = new URL(serverUri).hostname
  return loadAccounts({ root, hostname })
    .map(userDirectory => userDirectory.substr(0, userDirectory.length - hostname.length - 1))
}
