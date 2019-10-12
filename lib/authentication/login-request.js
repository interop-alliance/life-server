'use strict'

const debug = require('../debug').authentication

const AuthRequest = require('./auth-request')
const { PasswordAuthenticator } = require('./authenticator')

const PASSWORD_AUTH = 'password'

/**
 * Models a local Login request
 */
class LoginRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   *
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.userStore] {UserStore}
   * @param [options.accountManager] {AccountManager}
   * @param [options.returnToUrl] {string}
   * @param [options.authQueryParams] {Object} Key/value hashmap of parsed query
   *   parameters that will be passed through to the /authorize endpoint.
   * @param [options.authenticator] {Authenticator} Auth strategy by which to
   *   log in
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
    let options = AuthRequest.requestOptions(req, res)
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
    debug('Logging in via username + password')

    let request = LoginRequest.fromParams(req, res, PASSWORD_AUTH)

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
  static login (request) {
    return request.authenticator.findValidUser()

      .then(validUser => {
        request.initUserSession(validUser)

        request.redirectPostLogin(validUser)
      })

      .catch(error => request.error(error))
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

    if (this.authQueryParams['client_id']) {
      // Login request is part of an app's auth flow
      uri = this.authorizeUrl()
    } else if (validUser) {
      // Login request is a user going to /login in browser
      // uri = this.accountManager.accountUriFor(validUser.username)
      uri = validUser.accountUri
    }

    return uri
  }

  /**
   * Redirects the Login request to continue on the OIDC auth workflow.
   */
  redirectPostLogin (validUser) {
    let uri = this.postLoginUrl(validUser)
    debug('Login successful, redirecting to ', uri)
    this.response.redirect(uri)
  }

  /**
   * Renders the login form
   */
  renderForm (error) {
    let params = Object.assign({}, this.authQueryParams,
      {
        registerUrl: this.registerUrl(),
        returnToUrl: this.returnToUrl,
        enablePassword: this.localAuth.password
      })

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('auth/login', { title: 'Login', ...params })
  }
}

module.exports = {
  LoginRequest,
  PASSWORD_AUTH
}
