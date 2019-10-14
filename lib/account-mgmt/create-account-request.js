'use strict'

const AuthRequest = require('../authentication/auth-request')
const { logger } = require('../logger')
const { isValidUsername } = require('./account-manager')

/**
 * Represents a 'create new user account' http request (either a POST to the
 * `/accounts/api/new` endpoint, or a GET to `/register`).
 *
 * Intended just for browser-based requests; to create new user accounts from
 * a command line, use the `AccountManager` class directly.
 *
 * This is an abstract class, subclasses are created (for example
 * `CreateOidcAccountRequest`) depending on which Authentication mode the server
 * is running in.
 *
 * @class CreateAccountRequest
 */
class CreateAccountRequest extends AuthRequest {
  /**
   * @param [options={}] {Object}
   * @param [options.accountManager] {AccountManager}
   * @param [options.userAccount] {UserAccount}
   * @param [options.session] {Session} e.g. req.session
   * @param [options.response] {HttpResponse}
   * @param [options.returnToUrl] {string} If present, redirect the agent to
   *   this url on successful account creation
   */
  constructor (options) {
    super(options)

    this.username = options.username
    this.userAccount = options.userAccount
  }

  /**
   * Factory method, creates an appropriate CreateAccountRequest subclass from
   * an HTTP request (browser form submit), depending on the authn method.
   *
   * @param req
   * @param res
   *
   * @throws {Error} If required parameters are missing (via
   *   `userAccountFrom()`), or it encounters an unsupported authentication
   *   scheme.
   *
   * @return {CreateAccountRequest|CreateTlsAccountRequest}
   */
  static fromParams (req, res) {
    let options = AuthRequest.requestOptions(req, res)

    let locals = req.app.locals
    let authMethod = locals.authMethod
    let accountManager = locals.accountManager

    let body = req.body || {}

    options.username = body.username

    if (options.username) {
      options.userAccount = accountManager.userAccountFrom(body)
    }

    if (authMethod === 'oidc') {
      options.password = body.password
      return new CreateOidcAccountRequest(options)
    } else {
      throw new TypeError('Unsupported authentication scheme')
    }
  }

  static post (req, res) {
    let request = CreateAccountRequest.fromParams(req, res)

    return Promise.resolve()
      .then(() => request.validate())
      .then(() => request.createAccount())
      .catch(error => request.error(error))
  }

  static get (req, res) {
    let request = CreateAccountRequest.fromParams(req, res)

    return Promise.resolve()
      .then(() => request.renderForm())
      .catch(error => request.error(error))
  }

  /**
   * Renders the Register form
   */
  renderForm (error) {
    let params = Object.assign({}, this.authQueryParams,
      {
        returnToUrl: this.returnToUrl,
        loginUrl: this.loginUrl()
      })

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('account/register', { title: 'Register', ...params })
  }

  /**
   * Creates an account for a given user (from a POST to `/api/accounts/new`)
   *
   * @throws {Error} An http 400 error if an account already exists
   *
   * @return {Promise<UserAccount>} Resolves with newly created account instance
   */
  async createAccount () {
    const userAccount = this.userAccount
    const accountManager = this.accountManager

    return Promise.resolve(userAccount)
      .then(this.cancelIfUsernameInvalid.bind(this))
      .then(this.cancelIfAccountExists.bind(this))
      .then(this.createAccountStorage.bind(this))
      .then(this.saveCredentialsFor.bind(this))
      .then(this.initUserSession.bind(this))
      .then(this.sendResponse.bind(this))
      .then(userAccount => {
        // 'return' not used deliberately, no need to block and wait for email
        if (userAccount && userAccount.email) {
          logger.info('Sending Welcome email')
          accountManager.sendWelcomeEmail(userAccount)
        }
      })
      .then(() => {
        return userAccount
      })
  }

  /**
   * Throws an error if an account already exists
   *
   * @return {Promise<UserAccount>} Chainable
   */
  async cancelIfAccountExists (userAccount) {
    const exists = await this.accountManager.accountExists(userAccount.username)

    if (exists) {
      logger.info(`Canceling account creation, ${userAccount.webId} already exists`)
      let error = new Error('Account already exists')
      error.status = 400
      throw error
    }

    return userAccount
  }

  /**
   * Creates the root storage folder, initializes default containers and
   * resources for the new account.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @throws {Error} If errors were encountering while creating new account
   *   resources.
   *
   * @return {Promise<UserAccount>} Chainable
   */
  async createAccountStorage (userAccount) {
    try {
      await this.accountManager.createAccountStorage(userAccount)

      if (this.storage.collectionManager) {
        await this.storage.collectionManager.createDefaultCollections(userAccount)
      }
    } catch (error) {
      error.message = 'Error creating account storage: ' + error.message
      throw error
    }

    logger.info('Account storage resources created')

    return userAccount
  }

  /**
   * Check if a username is a valid slug.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @throws {Error} If errors were encountering while validating the
   *   username.
   *
   * @return {Promise<UserAccount>} Chainable
   */
  cancelIfUsernameInvalid (userAccount) {
    if (!userAccount.username || !isValidUsername(userAccount.username)) {
      const error = new Error('Invalid username')
      error.status = 400
      throw error
    }

    return userAccount
  }
}

/**
 * Models a Create Account request for a server using WebID-OIDC (OpenID Connect)
 * as a primary authentication mode. Handles saving user credentials to the
 * `UserStore`, etc.
 *
 * @class CreateOidcAccountRequest
 * @extends CreateAccountRequest
 */
class CreateOidcAccountRequest extends CreateAccountRequest {
  /**
   * @constructor
   *
   * @param [options={}] {Object} See `CreateAccountRequest` constructor docstring
   * @param [options.password] {string} Password, as entered by the user at signup
   */
  constructor (options) {
    super(options)

    this.password = options.password
  }

  /**
   * Validates the Login request (makes sure required parameters are present),
   * and throws an error if not.
   *
   * @throws {Error} If missing required params
   */
  validate () {
    let error

    if (!this.username) {
      error = new Error('Username required')
      error.statusCode = 400
      throw error
    }

    if (!this.password) {
      error = new Error('Password required')
      error.statusCode = 400
      throw error
    }
  }

  /**
   * Generate salted password hash, etc.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<null|Graph>}
   */
  saveCredentialsFor (userAccount) {
    return this.userStore.createUser(userAccount, this.password)
      .then(() => {
        logger.info('User credentials stored')
        return userAccount
      })
  }

  sendResponse (userAccount) {
    let redirectUrl = this.returnToUrl ||
      this.accountManager.accountUriFor(userAccount.username)
    this.response.redirect(redirectUrl)

    return userAccount
  }
}

module.exports = CreateAccountRequest
module.exports.CreateAccountRequest = CreateAccountRequest
