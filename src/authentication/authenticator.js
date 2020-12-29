'use strict'

const { logger } = require('./../logger')
const { isUri } = require('valid-url')
const HttpError = require('standard-http-error')
// const provider = require('oidc-auth-manager/src/preferred-provider')
// const { domainMatches } = require('oidc-auth-manager/src/oidc-manager')

/**
 * Abstract Authenticator class, representing a local login strategy.
 * To subclass, implement `fromParams()` and `findValidUser()`.
 * Used by the `LoginRequest` handler class.
 *
 * @abstract
 * @class Authenticator
 */
class Authenticator {
  constructor (options) {
    this.accountManager = options.accountManager
  }

  /**
   * @param req {IncomingRequest}
   * @param options {Object}
   */
  static fromParams (req, options) {
    throw new Error('Must override method')
  }

  /**
   * @returns {Promise<UserAccount>}
   */
  findValidUser () {
    throw new Error('Must override method')
  }
}

/**
 * Authenticates user via Username+Password.
 */
class PasswordAuthenticator extends Authenticator {
  /**
   * @constructor
   * @param options {Object}
   *
   * @param [options.username] {string} Unique identifier submitted by user
   *   from the Login form. Can be one of:
   *   - An account name (e.g. 'alice'), if server is in Multi-User mode
   *   - A WebID URI (e.g. 'https://alice.example.com/#me')
   *
   * @param [options.password] {string} Plaintext password as submitted by user
   *
   * @param [options.storage] {StorageManager}
   *
   * @param [options.accountManager] {AccountManager}
   */
  constructor (options) {
    super(options)

    this.userStore = options.storage && options.storage.users
    this.username = options.username
    this.password = options.password
  }

  /**
   * Factory method, returns an initialized instance of PasswordAuthenticator
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param [req.body={}] {Object}
   * @param [req.body.username] {string}
   * @param [req.body.password] {string}
   *
   * @param options {Object}
   *
   * @param [options.accountManager] {AccountManager}
   * @param [options.userStore] {UserCredentialStore}
   *
   * @return {PasswordAuthenticator}
   */
  static fromParams (req, options) {
    const body = req.body || {}

    options.username = body.username
    options.password = body.password

    return new PasswordAuthenticator(options)
  }

  /**
   * Ensures required parameters are present,
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
   * Loads a user from the user store, and if one is found and the
   * password matches, returns a `UserAccount` instance for that user.
   *
   * @throws {Error} If failures to load user are encountered
   *
   * @return {Promise<UserAccount>}
   */
  async findValidUser () {
    let userOptions

    this.validate() // throws error if invalid
    if (isUri(this.username)) {
      // A WebID URI was entered into the username field
      userOptions = { webId: this.username }
    } else {
      // A regular username
      userOptions = { username: this.username }
    }
    const user = this.accountManager.userAccountFrom(userOptions)
    logger.info(`Attempting to login user: ${user.id}`)

    const foundUser = await this.userStore.findUser(user.id)
    if (!foundUser) {
      throw new HttpError(400, 'No user found for that username')
    }
    const validUser = await this.userStore.matchPassword(foundUser, this.password)
    if (!validUser) {
      throw new HttpError(400, 'User found but no password match')
    }
    logger.info('User found, password matches')

    return this.accountManager.userAccountFrom(validUser)
  }
}

module.exports = {
  Authenticator,
  PasswordAuthenticator
}
