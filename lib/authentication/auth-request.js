'use strict'

const url = require('url')
const { logger } = require('./../logger')

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
class AuthRequest {
  /**
   * @constructor
   * @param options.host {SolidHost}
   * @param [options.accountManager] {AccountManager}
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.storage] {StorageManager}
   * @param [options.userStore] {UserCredentialStore} TODO: Merge this into above item
   * @param [options.returnToUrl] {string}
   * @param [options.authQueryParams] {Object} Key/value hashmap of parsed query
   *   parameters that will be passed through to the /authorize endpoint.
   */
  constructor (options) {
    this.host = options.host
    this.accountManager = options.accountManager
    this.response = options.response
    this.session = options.session || {}
    this.storage = options.storage
    this.userStore = options.userStore
    this.returnToUrl = options.returnToUrl
    this.authQueryParams = options.authQueryParams || {}
    this.localAuth = options.localAuth
  }

  /**
   * Extracts a given parameter from the request - either from a GET query param,
   * a POST body param, or an express registered `/:param`.
   * Usage:
   *
   *   ```
   *   AuthRequest.parseParameter(req, 'client_id')
   *   // -> 'client123'
   *   ```
   *
   * @param req {IncomingRequest}
   * @param parameter {string} Parameter key
   *
   * @return {string|null}
   */
  static parseParameter (req, parameter) {
    const query = req.query || {}
    const body = req.body || {}
    const params = req.params || {}

    return query[parameter] || body[parameter] || params[parameter] || null
  }

  /**
   * Extracts the options in common to most auth-related requests.
   *
   * @param req
   * @param res
   *
   * @return {Object}
   */
  static requestOptions (req, res) {
    let userStore, host, accountManager, localAuth, storage

    if (req.app && req.app.locals) {
      const locals = req.app.locals

      if (locals.oidc) {
        userStore = locals.oidc.users
      }

      host = locals.host
      accountManager = locals.accountManager
      localAuth = locals.localAuth
      storage = locals.storage
    }

    const authQueryParams = AuthRequest.extractAuthParams(req)
    const returnToUrl = AuthRequest.parseParameter(req, 'returnToUrl')

    return {
      response: res,
      session: req.session,
      userStore,
      host,
      accountManager,
      returnToUrl,
      authQueryParams,
      localAuth,
      storage
    }
  }

  /**
   * Initializes query params required by Oauth2/OIDC type work flow from the
   * request body.
   * Only authorized params are loaded, all others are discarded.
   *
   * @param req {IncomingRequest}
   *
   * @return {Object}
   */
  static extractAuthParams (req) {
    let params
    if (req.method === 'POST') {
      params = req.body
    } else {
      params = req.query
    }

    if (!params) { return {} }

    const extracted = {}

    const paramKeys = AUTH_QUERY_PARAMS
    let value

    for (const p of paramKeys) {
      value = params[p]
      // value = value === 'undefined' ? undefined : value
      extracted[p] = value
    }

    return extracted
  }

  /**
   * Calls the appropriate form to display to the user.
   * Serves as an error handler for this request workflow.
   *
   * @param error {Error}
   */
  error (error) {
    error.statusCode = error.statusCode || 400

    this.renderForm(error)
  }

  /**
   * Initializes a session (for subsequent authentication/authorization) with
   * a given user's credentials.
   *
   * @param userAccount {UserAccount}
   */
  initUserSession (userAccount) {
    const session = this.session

    logger.info('Initializing user session for: ', userAccount.webId)

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
    authUrl.query = this.authQueryParams

    return url.format(authUrl)
  }

  /**
   * Returns this installation's /register url. Used for redirecting post-signup.
   *
   * @return {string}
   */
  registerUrl () {
    const { host } = this
    const signupUrl = url.parse(url.resolve(host.serverUri, '/register'))
    signupUrl.query = this.authQueryParams

    return url.format(signupUrl)
  }

  /**
   * Returns this installation's /login url.
   *
   * @return {string}
   */
  loginUrl () {
    const { host } = this
    const loginUrl = url.parse(url.resolve(host.serverUri, '/login'))

    loginUrl.query = this.authQueryParams

    return url.format(loginUrl)
  }
}

AuthRequest.AUTH_QUERY_PARAMS = AUTH_QUERY_PARAMS

module.exports = AuthRequest
