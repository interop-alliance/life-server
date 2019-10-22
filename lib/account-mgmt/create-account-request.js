'use strict'

const AuthRequest = require('../authentication/auth-request')
const { logger } = require('../logger')
const { isValidUsername } = require('./account-manager')
const HttpError = require('standard-http-error')

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
   * @param [options.username] {string}
   * @param [options.userAccount] {UserAccount}
   * @param [options.session] {Session} e.g. req.session
   * @param [options.response] {ServerResponse}
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
   * @return {CreateAccountRequest}
   */
  static fromParams (req, res) {
    const options = AuthRequest.requestOptions(req, res)

    const locals = req.app.locals
    const authMethod = locals.authMethod
    const accountManager = locals.accountManager

    const body = req.body || {}

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

  static async post (req, res) {
    const request = CreateAccountRequest.fromParams(req, res)

    try {
      request.validate()
      await request.createAccount()
    } catch (error) {
      request.error(error)
    }
  }

  static async get (req, res) {
    const request = CreateAccountRequest.fromParams(req, res)

    try {
      request.renderForm()
    } catch (error) {
      request.error(error)
    }
  }

  /**
   * Renders the Register form
   */
  renderForm (error) {
    const params = Object.assign({}, this.authQueryParams,
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
    const { userAccount, accountManager } = this

    this.cancelIfUsernameInvalid(userAccount)
    await this.cancelIfAccountExists(userAccount)
    await this.createAccountStorage(userAccount)
    await this.saveCredentialsFor(userAccount)
    await this.initUserSession(userAccount)
    this.sendResponse(userAccount)

    if (userAccount && userAccount.email) {
      logger.info('Sending Welcome email')
      // This is an async function but 'await' not used deliberately -
      // no need to block and wait for email to be sent
      accountManager.sendWelcomeEmail(userAccount)
    }
    return userAccount
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
      throw new HttpError(400, 'Account already exists')
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
      await this.accountManager.provisionAccountStorage(userAccount)

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
      throw new HttpError(400, 'Invalid username')
    }

    return userAccount
  }
}

/**
 * Models a Create Account request for a server using WebID-OIDC (OpenID Connect)
 * as a primary authentication mode. Handles saving user credentials to the
 * `UserCredentialStore`, etc.
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
    if (!this.username) {
      throw new HttpError(400, 'Username required')
    }

    if (!this.password) {
      throw new HttpError(400, 'Password required')
    }
  }

  /**
   * Generate salted password hash, etc.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<null|Graph>}
   */
  async saveCredentialsFor (userAccount) {
    await this.userStore.createUser(userAccount, this.password)
    logger.info('User credentials stored')
    return userAccount
  }

  sendResponse (userAccount) {
    const redirectUrl = this.returnToUrl ||
      this.accountManager.accountUriFor(userAccount.username)
    this.response.redirect(redirectUrl)

    return userAccount
  }
}

module.exports = {
  CreateAccountRequest
}
