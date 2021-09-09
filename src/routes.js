'use strict'

const express = require('express')
const bodyParserJson = express.json()
const bodyParserForm = express.urlencoded({ extended: false })
const bodyParserText = express.text({ type: () => true })
const session = require('express-session')
// const MemoryStore = require('memorystore')(session)
const getOidcOpMiddleware = require('oidc-op-express')
const path = require('path')
const HttpError = require('standard-http-error')
const { v1: uuidv1 } = require('uuid')
const vhost = require('vhost')

const { ldpRequestHandler } = require('./storage/api')
const { corsSettings } = require('./server/common-headers')
const errorPages = require('./server/error-pages')
const { ApiRequest } = require('./server/api-request')
const { CreateAccountRequest } = require('./accounts/handlers/create-account-request')
const { RegisterWalletRequest } = require('./wallet/register-wallet-request')
const { WalletRequest } = require('./wallet/wallet-request')
const { WebKmsRequest } = require('./kms/web-kms-request')
const DeleteAccountRequest = require('./accounts/handlers/delete-account-request')
const DeleteAccountConfirmRequest = require('./accounts/handlers/delete-account-confirm-request')
const ShareRequest = require('./authorization/share-request')
const TransactionRequest = require('./gnap/transaction-request')
const { LoginRequest } = require('./authentication/handlers/login-request')
const PasswordResetEmailRequest = require('./accounts/handlers/password-reset-email-request')
const PasswordChangeRequest = require('./accounts/handlers/password-change-request')
const SelectProviderRequest = require('./authentication/handlers/select-provider-request')
const LogoutRequest = require('./authentication/handlers/logout-request')
const AuthCallbackRequest = require('./authentication/handlers/auth-callback-request')

function initializeExpressRoutes ({ app, argv, oidc, accountManager, logger }) {
  const { multiuser, host } = argv
  const useSecureCookies = !!argv.sslKey // use secure cookies when over HTTPS

  // Init static routes
  // Serve the public 'common' directory (for shared CSS files, etc)
  app.use('/common', express.static(path.join(__dirname, '..', 'common')))
  app.use('/.well-known',
    express.static(path.join(__dirname, '..', 'common', 'well-known')))

  // Serve bootstrap from its node_module directory
  _routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css')
  _routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css.map')

  // Options handler
  app.options('/*', ldpRequestHandler())

  if (argv.webid) { // Authentication and authorization enabled in config
    /**
     * Session / cookie handler
     */
    _initSessionHandler({ app, useSecureCookies, host })

    /**
     * Account Management API
     */
    app.head('/', _checkAccountExists({ accountManager, logger }))
    app.post('/api/accounts/new', _checkFeatureFlag('allowAccountCreation'),
      bodyParserJson, CreateAccountRequest.post())
    app.get(['/register', '/api/accounts/new'], _checkFeatureFlag('allowAccountCreation'),
      CreateAccountRequest.get())
    app.post('/api/presentations/verify', bodyParserJson, WebKmsRequest.prove())
    app.get('/api/wallet/new', RegisterWalletRequest.get())
    app.post('/api/wallet/new', RegisterWalletRequest.post())
    app.get('/api/wallet/worker', WalletRequest.getWorker())
    app.get('/api/wallet/get', WalletRequest.getOperationUi())
    app.get('/api/wallet/store', WalletRequest.storeOperationUi())
    app.get('/account/delete', DeleteAccountRequest.get())
    app.post('/account/delete', bodyParserForm, DeleteAccountRequest.post())
    app.get('/account/delete/confirm', DeleteAccountConfirmRequest.get())
    app.post('/account/delete/confirm', bodyParserForm,
      DeleteAccountConfirmRequest.post())

    /**
     * Authentication API
     */
    // Experimental GNAP endpoint
    app.post('/transaction', bodyParserJson, TransactionRequest.post())

    if (argv.forceUser) {
      app.use('/', (req, res, next) => {
        logger.warn(`Identified user (override): ${argv.forceUser}`)
        req.session.userId = argv.forceUser
        next()
      })
    } else {
      // User-facing Authentication API
      app.get('/api/auth/select-provider', SelectProviderRequest.get)
      app.post('/api/auth/select-provider', bodyParserForm, SelectProviderRequest.post)
      app.get(['/login', '/signin'], LoginRequest.get)
      app.post('/login/password', bodyParserJson, LoginRequest.loginPassword)
      app.get('/account/password/reset', PasswordResetEmailRequest.get())
      app.post('/account/password/reset', bodyParserForm, PasswordResetEmailRequest.post())
      app.get('/account/password/change', PasswordChangeRequest.get())
      app.post('/account/password/change', bodyParserForm, PasswordChangeRequest.post())
      app.get('/logout', LogoutRequest.get())
      app.get('/goodbye', (req, res) => { res.render('auth/goodbye', { title: 'Goodbye' }) })

      // The relying party callback is called at the end of the OIDC login process
      app.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get())

      // Initialize the OIDC Identity Provider routes/api
      // app.get('/.well-known/openid-configuration', discover.bind(provider))
      // app.get('/jwks', jwks.bind(provider))
      // app.post('/register', register.bind(provider))
      // app.get('/authorize', authorize.bind(provider))
      // app.post('/authorize', authorize.bind(provider))
      // app.post('/token', token.bind(provider))
      // app.get('/userinfo', userinfo.bind(provider))
      // app.get('/logout', logout.bind(provider))
      app.use('/', getOidcOpMiddleware(oidc.provider))

      // Perform resource authentication
      app.use('/', oidc.rs.authenticate())

      // Expose session.userId
      app.use('/', (req, res, next) => {
        oidc.webIdFromClaims(req.claims)
          .then(webId => {
            if (webId) {
              req.session.userId = webId
            }
            next()
          })
          .catch(err => {
            const error = new Error('Could not verify Web ID from token claims')
            error.statusCode = 401
            error.statusText = 'Invalid login'
            error.cause = err
            next(error)
          })
      })
    }

    /**
     * Authorization API
     */
    app.get('/api/share', (req, res, next) => ShareRequest.get(req, res).catch(next))
    app.post('/api/share', bodyParserForm,
      (req, res, next) => ShareRequest.post(req, res).catch(next))

    /**
     * Enable LDP routes on user subdomains, if applicable
     */
    if (multiuser) {
      app.use(vhost('*', _addLdpMiddleware({ corsSettings })))
    }
  }

  // Attach the LDP middleware
  app.use('/', _addLdpMiddleware({ corsSettings }))

  // Errors
  app.use(errorPages.handler)

  return app
}

function _addLdpMiddleware ({ corsSettings }) {
  const router = express.Router('/')

  const handleLdpRequest = ldpRequestHandler()

  router.use(corsSettings)

  // Note: options handler is set in create-app
  router.head('/*', handleLdpRequest)
  router.get('/*', handleLdpRequest)
  router.post('/*', handleLdpRequest)
  router.put('/*', handleLdpRequest)
  router.delete('/*', handleLdpRequest)
  router.copy('/*', handleLdpRequest)
  router.patch('/*', bodyParserText, handleLdpRequest)

  return router
}

function _initSessionHandler ({ app, useSecureCookies, host, secret = uuidv1() }) {
  const sessionSettings = {
    secret,
    // store: new MemoryStore({
    //   checkPeriod: 24 * 60 * 60 * 1000 // prune/expire entries every 24h (in ms)
    // }),
    saveUninitialized: false,
    resave: false,
    rolling: true,
    cookie: {
      // Enable 3rd-party cookies for CHAPI wallet use.
      sameSite: 'None',
      maxAge: 14 * 24 * 60 * 60 * 1000, // 2 weeks in milliseconds
      domain: host.cookieDomain,
      secure: useSecureCookies // true if https is on
    }
  }

  app.use(session(sessionSettings))
}

/**
 * Returns an Express middleware handler for checking if a particular account
 * exists (used by Signup apps).
 *
 * @param accountManager {AccountManager}
 *
 * @return {Function}
 */
function _checkAccountExists ({ accountManager, logger }) {
  return async (req, res, next) => {
    const { host } = req.app.locals
    const accountUrl = host.parseTargetUrl(req)

    try {
      const found = await accountManager.accountUrlExists(accountUrl)
      if (!found) {
        logger.info(`Account ${accountUrl} is available (for ${req.originalUrl})`)
        return res.sendStatus(404)
      }
      logger.info(`Account ${accountUrl} is not available (for ${req.originalUrl})`)
      next()
    } catch (error) {
      next(error)
    }
  }
}

function _checkFeatureFlag ({ name, logger }) {
  return (req, res, next) => {
    const { host: { features } } = ApiRequest.baseOptions(req, res)

    if (features[name] !== undefined && !features[name]) {
      logger.warn(`Feature '${name}' is disabled.`)
      return next(new HttpError(400, 'This feature or API endpoint is disabled.'))
    }
    next()
  }
}

/**
 * Adds a route that serves a static file from another Node module
 */
function _routeResolvedFile (router, path, file, appendFileName = true) {
  const fullPath = appendFileName ? path + file.match(/[^/]+$/) : path
  const fullFile = require.resolve(file)
  router.get(fullPath, (req, res) => res.sendFile(fullFile))
}

module.exports = {
  initializeExpressRoutes
}
