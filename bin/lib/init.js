const inquirer = require('inquirer')
const fs = require('fs-extra')
const questions = require('./options')
const camelize = require('camelize')
const util = require('util')
const path = require('path')

module.exports = function (program) {
  program
    .command('init')
    .description('create server configuration file')
    .action(async (opts) => {
      try {
        const answers = await inquirer.prompt(questions)
        const config = camelize(answers)

        const configPath = path.resolve(config.configFile)

        console.log('Generated config:', util.inspect(config))

        await fs.writeFile(configPath,
          'module.exports = ' + util.inspect(config))

        console.log('Wrote to:', configPath)
      } catch (error) {
        console.error('Error initializing a config file:', error)
      }
    })
}
