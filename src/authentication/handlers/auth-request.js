'use strict'

const { URL, URLSearchParams } = require('url')
const { logger } = require('../../logger')
const { ApiRequest } = require('../../api-request')

/**
 * Hidden form fields from the login page that must be passed through to the
 * Authentication request.
 * @type {Array<string>}
 */
const AUTH_QUERY_PARAMS = ['response_type', 'display', 'scope',
  'client_id', 'redirect_uri', 'state', 'nonce', 'request']

/**
 * Base authentication request (used for login and password reset workflows).
 */
class AuthRequest extends ApiRequest {
  /**
   * @param [options.returnToUrl] {string}
   * @param [options.localAuth] {object} Local authentication config object,
   *   typically: `{ password: true }`.
   */
  constructor (options) {
    super(options)

    this.returnToUrl = options.returnToUrl
    this.localAuth = options.localAuth
  }

  /**
   * Extracts the options in common to most auth-related requests.
   *
   * @param req
   * @param res
   *
   * @return {object}
   */
  static requestOptions (req, res) {
    let host, accountManager, localAuth, storage

    if (req.app && req.app.locals) {
      const locals = req.app.locals

      host = locals.host
      accountManager = locals.accountManager
      localAuth = locals.localAuth
      storage = locals.storage
    }

    const session = req.session || {}
    const credentials = { webId: session.userId }

    const returnToUrl = ApiRequest.parseParameter(req, 'returnToUrl')

    console.log('AuthRequest, returnToUrl:', returnToUrl)
    session.returnToUrl = returnToUrl || session.returnToUrl

    return {
      response: res,
      session: req.session,
      host,
      accountManager,
      returnToUrl,
      localAuth,
      storage,
      credentials
    }
  }

  /**
   * Initializes query params required by Oauth2/OIDC type work flow from the
   * request body.
   *
   * @param req {IncomingRequest}
   *
   * @return {object}
   */
  static extractAuthParams (req) {
    const params = req.query || {}

    if (Object.keys(params).length > 0) {
      req.session.authParams = params
    }

    return params
  }

  /**
   * Initializes a session (for subsequent authentication/authorization) with
   * a given user's credentials.
   *
   * @param userAccount {UserAccount}
   */
  initUserSession (userAccount) {
    const session = this.session

    logger.info('Initializing user session for: ' + userAccount.webId)

    session.userId = userAccount.webId
    session.subject = {
      _id: userAccount.webId
    }

    return userAccount
  }

  /**
   * Returns this installation's /authorize url. Used for redirecting post-login
   * and post-signup.
   *
   * @return {string}
   */
  authorizeUrl () {
    const { host } = this
    const authUrl = host.authEndpoint
    authUrl.search = (new URLSearchParams(this.session.authParams || {})).toString()
    this.session.authParams = {} // reset

    return authUrl.toString()
  }

  /**
   * Returns this installation's /register url. Used for redirecting post-signup.
   *
   * @return {string}
   */
  registerUrl () {
    const { host } = this
    const signupUrl = new URL('/register', host.serverUri)
    // signupUrl.search = (new URLSearchParams(this.authQueryParams)).toString()

    return signupUrl.toString()
  }

  /**
   * Returns this installation's /login url.
   *
   * @return {string}
   */
  loginUrl () {
    const { host } = this
    const loginUrl = new URL('/login', host.serverUri)

    loginUrl.search = (new URLSearchParams(this.session.authParams || {})).toString()

    return loginUrl.toString()
  }
}

AuthRequest.AUTH_QUERY_PARAMS = AUTH_QUERY_PARAMS

module.exports = AuthRequest
