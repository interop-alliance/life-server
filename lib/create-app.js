module.exports = createApp

const express = require('express')
const session = require('express-session')
const handlebars = require('express-handlebars')
const uuid = require('uuid')
const cors = require('cors')
const LDP = require('./ldp')
const addLdpMiddleware = require('./ldp-middleware')
const corsProxy = require('./handlers/cors-proxy')
const SolidHost = require('./models/solid-host')
const AccountManager = require('./models/account-manager')
const vhost = require('vhost')
const EmailService = require('./services/email-service')
const TokenService = require('./services/token-service')
const capabilityDiscovery = require('./capability-discovery')
const API = require('./api')
const ShareRequest = require('./requests/share-request')
const LegacyResourceMapper = require('./legacy-resource-mapper')
const errorPages = require('./handlers/error-pages')
const config = require('./server-config')
const defaults = require('../config/defaults')
const debug = require('./debug').authentication
const path = require('path')
const bodyParser = require('body-parser')
const { StorageManager } = require('./storage/ldp/storage-manager')
const { LdpFileStore } = require('./storage/ldp/ldp-file-store')
const { routeResolvedFile } = require('./utils')
const { version } = require('../package.json')
const { requestHandler: ldpRequestHandler } = require('./api/ldp/api')

const corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE', 'COPY'
  ],
  exposedHeaders: 'Authorization, User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Updates-Via, Allow, WAC-Allow, Content-Length, WWW-Authenticate, Source',
  credentials: true,
  maxAge: 1728000,
  origin: true,
  preflightContinue: true
})

function initMapper (host) {
  if (!host.root) {
    throw new Error('Missing root path parameter in config')
  }

  const mapper = new LegacyResourceMapper({
    rootUrl: host.serverUri,
    rootPath: path.resolve(host.root || process.cwd()),
    includeHost: host.multiuser
  })
  return mapper
}

function createApp (argv = {}) {
  // Override default configs (defaults) with passed-in params (argv)
  argv = Object.assign({}, defaults, argv)

  const hostConfig = config.hostConfigFor(argv)
  const host = SolidHost.from(hostConfig)
  argv.host = host

  const configPath = config.initConfigDir(argv)
  argv.templates = config.initTemplateDirs(configPath)

  config.printDebugInfo(argv)

  const mapper = initMapper(argv.host)
  argv.mapper = mapper

  // Legacy ldp store class
  const ldp = new LDP(argv)

  const app = express()

  // Init storage
  const storage = initStorage({ host, mapper })
  initAppLocals({app, argv, ldp, mapper, storage})
  initHeaders(app)
  initViews(app, configPath)

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

  // Add CORS proxy
  if (argv.proxy) {
    console.warn('The proxy configuration option has been renamed to corsProxy.')
    argv.corsProxy = argv.corsProxy || argv.proxy
    delete argv.proxy
  }
  if (argv.corsProxy) {
    corsProxy(app, argv.corsProxy)
  }

  // Options handler
  app.options('/*', ldpRequestHandler())

  // Authenticate the user
  if (argv.webid) {
    initWebId(argv, app, ldp)
  }

  // Attach the LDP middleware
  app.use('/', addLdpMiddleware({
    corsSettings, host: argv.host, mapper: argv.mapper
  }))

  // Errors
  app.use(errorPages.handler)

  return app
}

function initStorage ({ host, mapper }) {
  return new StorageManager({
    host: host,
    store: new LdpFileStore({ host, mapper })
  })
}

/**
 * Initializes `app.locals` parameters for downstream use (typically by route
 * handlers).
 *
 * @param app {Function} Express.js app instance
 * @param argv {Object} Config options hashmap
 * @param ldp {LDP}
 */
function initAppLocals ({app, argv, ldp, mapper, storage}) {
  app.locals.ldp = ldp
  app.locals.appUrls = argv.apps  // used for service capability discovery
  app.locals.host = argv.host
  app.locals.authMethod = argv.auth
  app.locals.localAuth = argv.localAuth
  app.locals.tokenService = new TokenService()
  app.locals.mapper = mapper
  app.locals.storage = storage

  if (argv.email && argv.email.host) {
    app.locals.emailService = new EmailService(argv.templates.email, argv.email)
  }
}

/**
 * Sets up headers common to all Solid requests (CORS-related, Allow, etc).
 *
 * @param app {Function} Express.js app instance
 */
function initHeaders (app) {
  app.use(corsSettings)

  app.use((req, res, next) => {
    res.set('X-Powered-By', 'Life Server/' + version)

    res.set('Vary', 'Accept, Authorization, Origin')

    // Set default Allow methods
    res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')
    next()
  })

  app.use('/', capabilityDiscovery())
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
 * @param ldp {LDP}
 */
function initWebId (argv, app, ldp) {
  config.ensureWelcomePage(argv)

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
        debug(`Rejecting session for ${userId} from ${origin}`)
        // Destroy session data
        delete req.session.userId
        // Ensure this modified session is not saved
        req.session.save = (done) => done()
      }
      next()
    })
  })

  let accountManager = AccountManager.from({
    authMethod: argv.auth,
    emailService: app.locals.emailService,
    tokenService: app.locals.tokenService,
    host: argv.host,
    accountTemplatePath: argv.templates.account,
    store: ldp,
    multiuser: argv.multiuser
  })
  app.locals.accountManager = accountManager

  // Account Management API (create account, new cert)
  app.use('/', API.accounts.middleware(accountManager))

  // Set up authentication-related API endpoints and app.locals
  initAuthentication(app, argv)

  app.get('/api/share', (req, res, next) => ShareRequest.get(req, res).catch(next))
  app.post('/api/share', bodyParser.urlencoded({ extended: true }),
    (req, res, next) => ShareRequest.post(req, res).catch(next))

  if (argv.multiuser) {
    app.use(vhost('*', addLdpMiddleware({
      corsSettings, host: argv.host, mapper: argv.mapper
    })))
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
  if (!(auth in API.authn)) {
    throw new Error(`Unsupported authentication scheme: ${auth}`)
  }
  API.authn[auth].initialize(app, argv)
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
  let sessionSettings = {
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
