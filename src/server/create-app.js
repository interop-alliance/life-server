module.exports = createApp

const express = require('express')
const handlebars = require('express-handlebars')
const ServerHost = require('./server-host')
const { AccountManager } = require('../accounts/account-manager')
const { StorageManager } = require('../storage/storage-manager')
const EmailService = require('../email/email-service')
const TokenService = require('../accounts/token-service')
const { logger } = require('../util/logger')
const config = require('./server-config')
const defaults = require('./defaults')
const path = require('path')
const { OidcManager } = require('../authentication/oidc-manager')
const { initHeaders } = require('./common-headers')
const { initializeExpressRoutes } = require('../routes')

async function createApp (argv = {}) {
  // Override default configs (defaults) with passed-in params (argv)
  argv = { ...defaults, ...argv }
  const { multiuser, root, server, dbPath } = argv

  const host = ServerHost.from(argv)
  argv.host = host

  const templates = {
    account: path.join(__dirname, '..', 'accounts', 'account-templates', 'new-account'),
    email: path.join(__dirname, '..', 'email', 'email-templates')
  }
  argv.templates = templates

  config.printDebugInfo(argv) // Prints server config

  const storage = StorageManager.from({
    host, couchConfig: argv.couchdb, dbPath, saltRounds: argv.saltRounds
  })

  const app = express()

  // Tell Express to trust reverse proxies like Nginx for secure cookie setting
  app.set('trust proxy', 1)

  initAppLocals({ app, argv, storage })
  initHeaders(app)
  initViews(app)

  let oidc, accountManager
  if (argv.webid) { // If authentication is enabled, initialize it
    if (multiuser && !argv.skipWelcomePage) {
      // Skip creating server welcome page (useful for tests)
      config.ensureWelcomePage({ root, multiuser, templates, server, host, storage })
    }
    oidc = OidcManager.from(argv, storage)
    app.locals.oidc = oidc
    await oidc.initialize(argv)
    accountManager = AccountManager.from({
      authMethod: argv.auth,
      emailService: app.locals.emailService,
      tokenService: app.locals.tokenService,
      host,
      accountTemplatePath: templates.account,
      storage,
      multiuser
    })
    app.locals.accountManager = accountManager
  }

  initializeExpressRoutes({ app, argv, oidc, accountManager, logger })

  return app
}

/**
 * Initializes `app.locals` parameters for downstream use (typically by route
 * handlers).
 *
 * @param app {Function} Express.js app instance
 * @param storage {StorageManager}
 * @param argv {Object} Config options hashmap
 */
function initAppLocals ({ app, argv, storage }) {
  app.locals.host = argv.host
  app.locals.authMethod = argv.auth
  app.locals.localAuth = argv.localAuth
  app.locals.tokenService = new TokenService()
  app.locals.storage = storage

  if (argv.email && argv.email.host) {
    app.locals.emailService = new EmailService(argv.templates.email, argv.email)
  }
}

/**
 * Sets up the express rendering engine and views directory.
 *
 * @param app {Function} Express.js app
 */
function initViews (app) {
  const viewsPath = path.join(__dirname, '..', 'views')

  app.set('views', viewsPath)
  app.engine('.hbs', handlebars({
    extname: '.hbs',
    partialsDir: viewsPath,
    layoutsDir: viewsPath + '/layouts',
    defaultLayout: 'main'
  }))
  app.set('view engine', '.hbs')
}
