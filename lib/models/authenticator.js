'use strict'

const debug = require('./../debug').authentication
const validUrl = require('valid-url')
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
   * @param [options.userStore] {UserStore}
   *
   * @param [options.accountManager] {AccountManager}
   */
  constructor (options) {
    super(options)

    this.userStore = options.userStore
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
   * @param [options.userStore] {UserStore}
   *
   * @return {PasswordAuthenticator}
   */
  static fromParams (req, options) {
    let body = req.body || {}

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
   * Loads a user from the user store, and if one is found and the
   * password matches, returns a `UserAccount` instance for that user.
   *
   * @throws {Error} If failures to load user are encountered
   *
   * @return {Promise<UserAccount>}
   */
  findValidUser () {
    let error
    let userOptions

    return Promise.resolve()
      .then(() => this.validate())
      .then(() => {
        if (validUrl.isUri(this.username)) {
          // A WebID URI was entered into the username field
          userOptions = { webId: this.username }
        } else {
          // A regular username
          userOptions = { username: this.username }
        }

        let user = this.accountManager.userAccountFrom(userOptions)

        debug(`Attempting to login user: ${user.id}`)

        return this.userStore.findUser(user.id)
      })
      .then(foundUser => {
        if (!foundUser) {
          error = new Error('No user found for that username')
          error.statusCode = 400
          throw error
        }

        return this.userStore.matchPassword(foundUser, this.password)
      })
      .then(validUser => {
        if (!validUser) {
          error = new Error('User found but no password match')
          error.statusCode = 400
          throw error
        }

        debug('User found, password matches')

        return this.accountManager.userAccountFrom(validUser)
      })
  }
}

module.exports = {
  Authenticator,
  PasswordAuthenticator
}
