'use strict'

const url = require('url')
const defaults = require('../../config/defaults')

/**
 * Represents the URI that a Solid server is installed on, and manages user
 * account URI creation.
 *
 * @class SolidHost
 */
class SolidHost {
  /**
   * @constructor
   * @param [options={}]
   * @param [options.port] {number}
   * @param [options.serverUri] {string} Fully qualified URI that this Solid
   *   server is listening on, e.g. `https://databox.me`
   */
  constructor (options = {}) {
    this.port = options.port || defaults.port
    this.serverUri = options.serverUri || defaults.serverUri

    this.parsedUri = url.parse(this.serverUri)
    this.host = this.parsedUri.host
    this.hostname = this.parsedUri.hostname
  }

  /**
   * Factory method, returns an instance of `SolidHost`.
   *
   * @param [options={}] {Object} See `constructor()` docstring.
   *
   * @return {SolidHost}
   */
  static from (options = {}) {
    return new SolidHost(options)
  }

  /**
   * Composes and returns an account URI for a given username, in multiUser mode.
   * Usage:
   *
   *   ```
   *   // host.serverUri === 'https://example.com'
   *
   *   host.accountUriFor('alice')  // -> 'https://alice.example.com'
   *   ```
   *
   * @param accountName {string}
   *
   * @throws {TypeError} If no accountName given, or if serverUri not initialized
   * @return {string}
   */
  accountUriFor (accountName) {
    if (!accountName) {
      throw TypeError('Cannot construct uri for blank account name')
    }
    if (!this.parsedUri) {
      throw TypeError('Cannot construct account, host not initialized with serverUri')
    }
    return this.parsedUri.protocol + '//' + accountName + '.' + this.host
  }

  /**
   * Returns the /authorize endpoint URL object (used in login requests, etc).
   *
   * @return {URL}
   */
  get authEndpoint () {
    let authUrl = url.resolve(this.serverUri, '/authorize')
    return url.parse(authUrl)
  }

  /**
   * Returns a cookie domain, based on the current host's serverUri.
   *
   * @return {string|null}
   */
  get cookieDomain () {
    let cookieDomain = null

    if (this.hostname.split('.').length > 1) {
      // For single-level domains like 'localhost', do not set the cookie domain
      // See section on 'domain' attribute at https://curl.haxx.se/rfc/cookie_spec.html
      cookieDomain = '.' + this.hostname
    }

    return cookieDomain
  }
}

module.exports = SolidHost
