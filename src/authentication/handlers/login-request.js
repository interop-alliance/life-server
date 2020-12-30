'use strict'

const { logger } = require('../../logger')

const AuthRequest = require('./auth-request')
const { PasswordAuthenticator } = require('../authenticator')

const PASSWORD_AUTH = 'password'

/**
 * Models a local Login request
 */
class LoginRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {object} Options hashmap, see `AuthRequest`'s constructor.
   *
   * @param options.authenticator {Authenticator} Auth strategy by which to
   *   log in
   * @param options.authMethod {string} Local authentication method being
   *   used (such as username & password, WebAuthn, etc).
   */
  constructor (options) {
    super(options)

    this.authenticator = options.authenticator
    this.authMethod = options.authMethod
  }

  /**
   * Factory method, returns an initialized instance of LoginRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   * @param authMethod {string}
   *
   * @return {LoginRequest}
   */
  static fromParams (req, res, authMethod) {
    const options = AuthRequest.requestOptions(req, res)
    options.authMethod = authMethod
    options.authenticator = null

    if (authMethod === PASSWORD_AUTH) {
      options.authenticator = PasswordAuthenticator.fromParams(req, options)
    }

    return new LoginRequest(options)
  }

  /**
   * Handles a Login GET request on behalf of a middleware handler, displays
   * the Login page.
   * Usage:
   *
   *   ```
   *   app.get('/login', LoginRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static get (req, res) {
    const request = LoginRequest.fromParams(req, res)
    AuthRequest.extractAuthParams(req) // save incoming query params in session

    request.renderForm()
  }

  /**
   * Handles a Login via Username+Password.
   * Errors encountered are displayed on the Login form.
   * Usage:
   *
   *   ```
   *   app.post('/login/password', LoginRequest.loginPassword)
   *   ```
   *
   * @param req
   * @param res
   *
   * @return {Promise}
   */
  static loginPassword (req, res) {
    logger.info('Logging in via username + password')

    const request = LoginRequest.fromParams(req, res, PASSWORD_AUTH)

    return LoginRequest.login(request)
  }

  /**
   * Performs the login operation -- loads and validates the
   * appropriate user, inits the session with credentials, and redirects the
   * user to continue their auth flow.
   *
   * @param request {LoginRequest}
   *
   * @return {Promise}
   */
  static async login (request) {
    try {
      const validUser = await request.authenticator.findValidUser()
      request.initUserSession(validUser)

      // request.redirectPostLogin(validUser)
      request.sendResponse(validUser)
    } catch (error) {
      request.errorJson(error)
    }
  }

  /**
   * Returns a URL to redirect the user to after login.
   * Either uses the provided `redirect_uri` auth query param, or simply
   * returns the user profile URI if none was provided.
   *
   * @param validUser {UserAccount}
   *
   * @return {string}
   */
  postLoginUrl (validUser) {
    let uri

    const session = this.session || {}

    const authParams = (session && session.authParams) || {}

    if (authParams.client_id) {
      // Login request is part of an app's auth flow
      uri = this.authorizeUrl()
    } else if (validUser) {
      // Login request is a user going to /login in browser
      // uri = this.accountManager.accountUriFor(validUser.username)
      uri = session.returnToUrl || validUser.accountUri
      delete session.returnToUrl
    }

    return uri
  }

  /**
   * Redirects the Login request to continue on the OIDC auth workflow.
   */
  redirectPostLogin (validUser) {
    const uri = this.postLoginUrl(validUser)
    logger.info('Login successful, redirecting to ' + uri)
    this.response.redirect(uri)
  }

  /**
   * Renders the login form
   */
  renderForm (error) {
    const params = {
      registerUrl: this.registerUrl(),
      returnToUrl: this.returnToUrl
    }

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('auth/login',
      { title: 'Login', layout: 'material', ...params })
  }

  /**
   * Sends response to user (directs the user to the next step of registration).
   *
   * @param validUser {UserAccount}
   */
  sendResponse (validUser) {
    const redirectUrl = this.postLoginUrl(validUser)
    logger.info('Login successful, redirecting to ' + redirectUrl)

    this.response.json({ redirect: redirectUrl })
  }
}

module.exports = {
  LoginRequest,
  PASSWORD_AUTH
}
