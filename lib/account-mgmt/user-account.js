'use strict'

const { URL } = require('url')

/**
 * Represents a user account (created as a result of Signup, etc).
 */
class UserAccount {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.username] {string}
   * @param [options.webId] {string}
   * @param [options.name] {string}
   * @param [options.email] {string}
   * @param [options.externalWebId] {string}
   * @param [options.localAccountId] {string}
   */
  constructor (options = {}) {
    this.username = options.username
    this.webId = options.webId
    this.name = options.name
    this.email = options.email
    this.externalWebId = options.externalWebId
    this.localAccountId = options.localAccountId
  }

  /**
   * Factory method, returns an instance of `UserAccount`.
   *
   * @param [options={}] {Object} See `contructor()` docstring.
   *
   * @return {UserAccount}
   */
  static from (options = {}) {
    return new UserAccount(options)
  }

  /**
   * Returns the display name for the account.
   *
   * @return {string}
   */
  get displayName () {
    return this.name || this.username || this.email || 'Life Server account'
  }

  /**
   * Returns the id key for the user account (for use with the user store, for
   * example), consisting of the WebID URI minus the protocol and slashes.
   * Usage:
   *
   *   ```
   *   userAccount.webId = 'https://alice.example.com/web#id'
   *   userAccount.id  // -> 'alice.example.com/web#id'
   *   ```
   *
   * @return {string}
   */
  get id () {
    if (!this.webId) { return null }

    const parsed = new URL(this.webId)
    let id = parsed.host + parsed.pathname
    if (parsed.hash) {
      id += parsed.hash
    }
    return id
  }

  get accountUri () {
    if (!this.webId) { return null }

    const parsed = new URL(this.webId)

    return parsed.protocol + '//' + parsed.host
  }

  /**
   * Returns the URI of the WebID Profile for this account.
   * Usage:
   *
   *   ```
   *   // userAccount.webId === 'https://alice.example.com/web#id'
   *
   *   userAccount.profileUri  // -> 'https://alice.example.com/web'
   *   ```
   *
   * @return {string|null}
   */
  // get profileUri () {
  //   if (!this.webId) { return null }
  //
  //   const parsed = new URL(this.webId)
  //   // Note that the hash fragment gets dropped
  //   return parsed.protocol + '//' + parsed.host + parsed.pathname
  // }
}

module.exports = UserAccount
