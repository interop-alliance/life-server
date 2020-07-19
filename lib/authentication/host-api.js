'use strict'

const { URL, URLSearchParams } = require('url')
const { logger } = require('../logger')

// const LogoutRequest = require('./handlers/logout-request')
const LoginConsentRequest = require('./handlers/login-consent-request')
const AuthResponseSent = require('./errors/auth-response-sent')

/**
 * Handles host-side authentication logic (this method is dependency injected
 * into the OIDC Provider instance).
 *
 * If the user is already authenticated (their user id is in the session),
 * simply sets the authRequest.subject property and returns the request.
 *
 * Otherwise, if not already authenticated, 302-redirects the user to the
 * /login endpoint.
 *
 * @param authRequest {AuthenticationRequest} Auth request object created inside
 *   an OIDC Provider in its /authorize endpoint handler.
 *
 * @throws {AuthResponseSent} If the user has been redirected to /login
 *
 * @return {AuthenticationRequest}
 */
function authenticate (authRequest) {
  const webId = authenticatedUser(authRequest)

  if (webId) {
    logger.info('User is already authenticated as ' + webId)

    initSubjectClaim(authRequest, webId)
  } else {
    // User not authenticated, send them to login
    logger.info('User not authenticated, sending to /login')

    redirectToLogin(authRequest)
  }

  return authRequest
}

function redirectToLogin (authRequest) {
  let loginUrl = new URL('/login', authRequest.provider.issuer)
  loginUrl.search = (new URLSearchParams(authRequest.req.query)).toString()

  authRequest.subject = null

  loginUrl = loginUrl.toString()
  logger.info('host.api/redirectToLogin: ' + loginUrl)

  authRequest.res.redirect(loginUrl)

  signalResponseSent()
}

function signalResponseSent () {
  throw new AuthResponseSent('User redirected to login')
}

/**
 * Extracts and returns the authenticated user from session, or null if none.
 *
 * @param authRequest {AuthenticationRequest}
 *
 * @return {string|null} Web ID of the authenticated user, or null
 */
function authenticatedUser (authRequest) {
  return authRequest.req.session.userId || null
}

/**
 * Initializes the authentication request's subject claim from session user id.
 *
 * @param authRequest {AuthenticationRequest} Auth request object created inside
 *   an OIDC Provider in its /authorize endpoint handler.
 */
function initSubjectClaim (authRequest, webId) {
  authRequest.subject = {
    _id: webId // put webId into the IDToken's subject claim
  }
}

/**
 * @param authRequest
 * @returns {Promise<AuthenticationRequest>}
 */
function obtainConsent (authRequest) {
  const skipConsent = false

  return LoginConsentRequest.handle(authRequest, skipConsent)
    .catch(error => {
      if (error instanceof AuthResponseSent) {
        throw error
      }
      logger.warn('Error in auth Consent step: ' + error)
    })
}

/**
 * @param logoutRequest {LogoutRequest}
 * @returns {Promise}
 */
function logout (logoutRequest) {
  logger.error('Error in host-api:' + new Error('host.logout not implemented'))
  // const { req, res } = logoutRequest
  //
  // return LogoutRequest.handle(logoutRequest.req, logoutRequest.res)
  //   .then(() => logoutRequest)
  //   .catch(error => {
  //     logger.error('Error in auth logout() step: ', error)
  //   })
}

module.exports = {
  authenticate,
  obtainConsent,
  logout,
  initSubjectClaim,
  authenticatedUser,
  redirectToLogin
}
