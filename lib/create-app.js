module.exports = createApp

const express = require('express')
const session = require('express-session')
const handlebars = require('express-handlebars')
const uuid = require('uuid')
const { addLdpMiddleware } = require('./data-storage/api')
const SolidHost = require('./solid-host')
const { AccountManager } = require('./account-mgmt/account-manager')
const vhost = require('vhost')
const EmailService = require('./email-service')
const TokenService = require('./account-mgmt/token-service')
const accountMgmtApi = require('./account-mgmt/api')
const ShareRequest = require('./authorization/share-request')
const errorPages = require('./error-pages')
const config = require('./server-config')
const defaults = require('./defaults')
const { logger } = require('./logger')
const path = require('path')
const bodyParser = require('body-parser')
const { ldpRequestHandler } = require('./data-storage/api')
const { corsSettings, initHeaders } = require('./common-headers')

function createApp (argv = {}) {
  // Override default configs (defaults) with passed-in params (argv)
  argv = Object.assign({}, defaults, argv)

  const hostConfig = config.hostConfigFor(argv)
  const host = SolidHost.from(hostConfig)
  argv.host = host

  const configPath = config.initConfigDir(argv)
  argv.templates = config.initTemplateDirs(configPath)

  config.printDebugInfo(argv) // Prints server config

  const app = express()

  const storage = config.initStorage({ host, couchConfig: argv.couchdb })
  initAppLocals({ app, argv, storage })
  initHeaders(app)
  initViews(app, configPath)
  initStaticRoutes(app)

  // Options handler
  app.options('/*', ldpRequestHandler())

  // If authentication is enabled, initialize it
  if (argv.webid) {
    initWebId(argv, app, storage)
  }

  // Attach the LDP middleware
  app.use('/', addLdpMiddleware({ corsSettings }))

  // Errors
  app.use(errorPages.handler)

  return app
}

function initStaticRoutes (app) {
  // Serve the public 'common' directory (for shared CSS files, etc)
  app.use('/common', express.static(path.join(__dirname, '../common')))
  app.use('/.well-known',
    express.static(path.join(__dirname, '../common/well-known')))

  // Serve bootstrap from it's node_module directory
  routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css')
  routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css.map')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.eot')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.svg')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.ttf')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.woff')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.woff2')
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
 * @param configPath {string}
 */
function initViews (app, configPath) {
  const viewsPath = config.initDefaultViews(configPath)

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
function initWebId (argv, app, storage) {
  config.ensureWelcomePage({ argv, storage })

  // Store the user's session key in a cookie
  // (for same-domain browsing by people only)
  const useSecureCookies = !!argv.sslKey // use secure cookies when over HTTPS
  const sessionHandler = session(sessionSettings(useSecureCookies, argv.host))
  app.use((req, res, next) => {
    sessionHandler(req, res, () => {
      // Reject cookies from third-party applications.
      // Otherwise, when a user is logged in to their Solid server,
      // any third-party application could perform authenticated requests
      // without permission by including the credentials set by the Solid server.
      const origin = req.headers.origin
      const userId = req.session.userId
      if (!argv.host.allowsSessionFor(userId, origin)) {
        logger.warn(`Rejecting session for ${userId} from ${origin}`)
        // Destroy session data
        delete req.session.userId
        // Ensure this modified session is not saved
        req.session.save = (done) => done()
      }
      next()
    })
  })

  const accountManager = AccountManager.from({
    authMethod: argv.auth,
    emailService: app.locals.emailService,
    tokenService: app.locals.tokenService,
    host: argv.host,
    accountTemplatePath: argv.templates.account,
    accountStore: storage.accountStore,
    multiuser: argv.multiuser
  })
  app.locals.accountManager = accountManager

  // Account Management API (create account, new cert)
  app.use('/', accountMgmtApi.middleware(accountManager))

  // Set up authentication-related API endpoints and app.locals
  initAuthentication(app, argv)

  app.get('/api/share', (req, res, next) => ShareRequest.get(req, res).catch(next))
  app.post('/api/share', bodyParser.urlencoded({ extended: true }),
    (req, res, next) => ShareRequest.post(req, res).catch(next))

  if (argv.multiuser) {
    app.use(vhost('*', addLdpMiddleware({ corsSettings })))
  }
}

/**
 * Sets up authentication-related routes and handlers for the app.
 *
 * @param app {Object} Express.js app instance
 * @param argv {Object} Config options hashmap
 */
function initAuthentication (app, argv) {
  const auth = argv.forceUser ? 'forceUser' : argv.auth
  const authenticationApi = require('./authentication')
  if (!(auth in authenticationApi)) {
    throw new Error(`Unsupported authentication scheme: ${auth}`)
  }
  authenticationApi[auth].initialize(app, argv)
}

/**
 * Returns a settings object for Express.js sessions.
 *
 * @param secureCookies {boolean}
 * @param host {SolidHost}
 *
 * @return {Object} `express-session` settings object
 */
function sessionSettings (secureCookies, host) {
  const sessionSettings = {
    secret: uuid.v1(),
    saveUninitialized: false,
    resave: false,
    rolling: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000
    }
  }
  // Cookies should set to be secure if https is on
  if (secureCookies) {
    sessionSettings.cookie.secure = true
  }

  // Determine the cookie domain
  sessionSettings.cookie.domain = host.cookieDomain

  return sessionSettings
}

/**
 * Adds a route that serves a static file from another Node module
 */
function routeResolvedFile (router, path, file, appendFileName = true) {
  const fullPath = appendFileName ? path + file.match(/[^/]+$/) : path
  const fullFile = require.resolve(file)
  router.get(fullPath, (req, res) => res.sendFile(fullFile))
}
