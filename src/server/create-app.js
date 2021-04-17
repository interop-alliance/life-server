module.exports = createApp

const express = require('express')
const handlebars = require('express-handlebars')
const { addLdpMiddleware } = require('../storage/api')
const ServerHost = require('./server-host')
const { AccountManager } = require('../accounts/account-manager')
const { StorageManager } = require('../storage/storage-manager')
const vhost = require('vhost')
const EmailService = require('../email-service')
const TokenService = require('../accounts/token-service')
const accountMgmtApi = require('../accounts/routes')
const ShareRequest = require('../authorization/share-request')
const errorPages = require('./error-pages')
const config = require('./server-config')
const defaults = require('../defaults')
const path = require('path')
const bodyParserJson = express.json()
const bodyParserForm = express.urlencoded({ extended: false })
const { ldpRequestHandler } = require('../storage/api')
const { corsSettings, initHeaders } = require('./common-headers')
const TransactionRequest = require('../authentication/gnap/transaction-request')

async function createApp (argv = {}) {
  // Override default configs (defaults) with passed-in params (argv)
  argv = { ...defaults, ...argv }

  const host = ServerHost.from({
    port: argv.port,
    serverUri: argv.serverUri,
    root: argv.root,
    multiuser: argv.multiuser,
    webid: argv.webid,
    features: argv.features
  })
  argv.host = host

  argv.templates = {
    account: path.join(__dirname, '..', 'templates', 'new-account'),
    email: path.join(__dirname, '..', 'templates', 'emails')
  }

  config.printDebugInfo(argv) // Prints server config

  const app = express()

  const storage = StorageManager.from({
    host,
    couchConfig: argv.couchdb,
    dbPath: argv.dbPath,
    saltRounds: argv.saltRounds
  })
  initAppLocals({ app, argv, storage })
  initHeaders(app)
  initViews(app)
  initStaticRoutes(app)

  // Options handler
  app.options('/*', ldpRequestHandler())

  // If authentication is enabled, initialize it
  if (argv.webid) {
    await initWebId(argv, app, storage)
  }

  // Attach the LDP middleware
  app.use('/', addLdpMiddleware({ corsSettings }))

  // Errors
  app.use(errorPages.handler)

  return app
}

function initStaticRoutes (app) {
  // Serve the public 'common' directory (for shared CSS files, etc)
  app.use('/common', express.static(path.join(__dirname, '..', '..', 'common')))
  app.use('/.well-known',
    express.static(path.join(__dirname, '..', '..', 'common', 'well-known')))

  // Serve bootstrap from it's node_module directory
  routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css')
  routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css.map')
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

/**
 * Sets up WebID-related functionality (account creation and authentication)
 *
 * @param argv {Object}
 * @param app {Function}
 * @param storage {StorageManager}
 */
async function initWebId (argv, app, storage) {
  const { root, multiuser, templates, server, host, skipWelcomePage } = argv
  if (multiuser && !skipWelcomePage) {
    // Skip creating server welcome page (useful for tests)
    config.ensureWelcomePage({ root, multiuser, templates, server, host, storage })
  }

  // Store the user's session key in a cookie
  // (for same-domain browsing)
  const useSecureCookies = !!argv.sslKey // use secure cookies when over HTTPS
  config.initSessionHandler({ app, useSecureCookies, host })

  app.post('/transaction', bodyParserJson, TransactionRequest.post())

  const accountManager = AccountManager.from({
    authMethod: argv.auth,
    emailService: app.locals.emailService,
    tokenService: app.locals.tokenService,
    host,
    accountTemplatePath: templates.account,
    storage,
    multiuser: multiuser
  })
  app.locals.accountManager = accountManager

  // Account Management API (create account, new cert)
  app.use('/', accountMgmtApi.middleware(accountManager))

  // Set up authentication-related API endpoints and app.locals
  await initAuthentication(app, argv, storage)

  app.get('/api/share', (req, res, next) => ShareRequest.get(req, res).catch(next))
  app.post('/api/share', bodyParserForm,
    (req, res, next) => ShareRequest.post(req, res).catch(next))

  if (multiuser) {
    app.use(vhost('*', addLdpMiddleware({ corsSettings })))
  }
}

/**
 * Sets up authentication-related routes and handlers for the app.
 *
 * @param app {Object} Express.js app instance
 * @param argv {Object} Config options hashmap
 */
async function initAuthentication (app, argv, storage) {
  const auth = argv.forceUser ? 'forceUser' : argv.auth
  const authenticationApi = require('../authentication')
  if (!(auth in authenticationApi)) {
    throw new Error(`Unsupported authentication scheme: ${auth}`)
  }
  await authenticationApi[auth].initialize(app, argv, storage)
}

/**
 * Adds a route that serves a static file from another Node module
 */
function routeResolvedFile (router, path, file, appendFileName = true) {
  const fullPath = appendFileName ? path + file.match(/[^/]+$/) : path
  const fullFile = require.resolve(file)
  router.get(fullPath, (req, res) => res.sendFile(fullFile))
}
