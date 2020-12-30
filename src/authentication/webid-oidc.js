'use strict'
/**
 * OIDC Relying Party API handler module.
 */

const express = require('express')
const bodyParserJson = express.json()
const bodyParserForm = express.urlencoded({ extended: false })
const { OidcManager } = require('./oidc-manager')
const { LoginRequest } = require('./handlers/login-request')

const PasswordResetEmailRequest = require('../accounts/handlers/password-reset-email-request')
const PasswordChangeRequest = require('../accounts/handlers/password-change-request')

const {
  AuthCallbackRequest,
  LogoutRequest,
  SelectProviderRequest
} = require('./handlers')

/**
 * Sets up OIDC authentication for the given app.
 *
 * @param app {object} Express.js app instance
 * @param argv {object} Config options hashmap
 * @param storage {StorageManager}
 */
async function initialize (app, argv, storage) {
  const oidc = OidcManager.from(argv, storage)
  app.locals.oidc = oidc
  await oidc.initialize(argv)

  // Attach the OIDC API
  app.use('/', middleware(oidc))

  // Perform the actual authentication
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
 * Returns a router with OIDC Relying Party and Identity Provider middleware:
 *
 * @method middleware
 *
 * @param oidc {OidcManager}
 *
 * @return {Router} Express router
 */
function middleware (oidc) {
  const router = express.Router('/')

  // User-facing Authentication API
  router.get('/api/auth/select-provider', SelectProviderRequest.get)
  router.post('/api/auth/select-provider', bodyParserForm, SelectProviderRequest.post)

  router.get(['/login', '/signin'], LoginRequest.get)

  router.post('/login/password', bodyParserJson, LoginRequest.loginPassword)

  router.get('/account/password/reset', PasswordResetEmailRequest.get())
  router.post('/account/password/reset', bodyParserForm, PasswordResetEmailRequest.post())

  router.get('/account/password/change', PasswordChangeRequest.get())
  router.post('/account/password/change', bodyParserForm, PasswordChangeRequest.post())

  router.get('/logout', LogoutRequest.get())

  router.get('/goodbye', (req, res) => { res.render('auth/goodbye', { title: 'Goodbye' }) })

  // The relying party callback is called at the end of the OIDC signin process
  router.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get())

  // Initialize the OIDC Identity Provider routes/api
  // router.get('/.well-known/openid-configuration', discover.bind(provider))
  // router.get('/jwks', jwks.bind(provider))
  // router.post('/register', register.bind(provider))
  // router.get('/authorize', authorize.bind(provider))
  // router.post('/authorize', authorize.bind(provider))
  // router.post('/token', token.bind(provider))
  // router.get('/userinfo', userinfo.bind(provider))
  // router.get('/logout', logout.bind(provider))
  const oidcProviderApi = require('oidc-op-express')(oidc.provider)
  router.use('/', oidcProviderApi)

  return router
}

/**
 * Sets the `WWW-Authenticate` response header for 401 error responses.
 * Used by error-pages handler.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param err {Error}
 */
function setAuthenticateHeader (req, res, err) {
  const locals = req.app.locals

  const errorParams = {
    realm: locals.host.serverUri,
    scope: 'openid webid',
    error: err.error,
    error_description: err.error_description,
    error_uri: err.error_uri
  }

  const challengeParams = Object.keys(errorParams)
    .filter(key => !!errorParams[key])
    .map(key => `${key}="${errorParams[key]}"`)
    .join(', ')

  res.set('WWW-Authenticate', 'Bearer ' + challengeParams)
}

/**
 * Provides custom logic for error status code overrides.
 *
 * @param statusCode {number}
 * @param req {IncomingRequest}
 *
 * @returns {number}
 */
function statusCodeOverride (statusCode, req) {
  if (isEmptyToken(req)) {
    return 400
  } else {
    return statusCode
  }
}

/**
 * Tests whether the `Authorization:` header includes an empty or missing Bearer
 * token.
 *
 * @param req {IncomingRequest}
 *
 * @returns {boolean}
 */
function isEmptyToken (req) {
  const header = req.get('Authorization')

  if (!header) { return false }

  if (header.startsWith('Bearer')) {
    const fragments = header.split(' ')

    if (fragments.length === 1) {
      return true
    } else if (!fragments[1]) {
      return true
    }
  }

  return false
}

module.exports = {
  initialize,
  isEmptyToken,
  middleware,
  setAuthenticateHeader,
  statusCodeOverride
}
