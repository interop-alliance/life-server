'use strict'

const { URL, URLSearchParams } = require('url')
const defaults = require('../defaults')

/**
 * Represents the URI that a server is installed on.
 *
 * @class ServerHost
 */
class ServerHost {
  /**
   * @constructor
   * @param [options={}]
   * @param [options.port] {number}
   * @param [options.serverUri] {string} Fully qualified URI that this server is
   *   listening on.
   * @param [options.root] {string}
   * @param [options.multiuser] {boolean}
   * @param [options.webid] {boolean}
   * @param [options.features] {object} Feature flags from config
   */
  constructor (options = {}) {
    this.port = options.port || defaults.port
    this.serverUri = options.serverUri || defaults.serverUri

    this.parsedUri = new URL(this.serverUri)
    this.host = this.parsedUri.host
    this.hostname = this.parsedUri.hostname

    this.root = options.root
    this.multiuser = options.multiuser
    this.webid = options.webid

    this.features = options.features || {}
  }

  /**
   * Factory method, returns an instance of `ServerHost`.
   *
   * @param [options={}] {Object} See `constructor()` docstring.
   *
   * @return {ServerHost}
   */
  static from (options = {}) {
    return new ServerHost(options)
  }

  get isSingleUser () {
    return !this.multiuser
  }

  get isMultiUser () {
    return this.multiuser
  }

  /**
   * Composes and returns an account URI for a given username, in multi-user mode.
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
   * Determines whether the given user is allowed to restore a session
   * from the given origin.
   *
   * @param userId {?string}
   * @param origin {?string}
   * @return {boolean}
   */
  allowsSessionFor (userId, origin) {
    // Allow no user or an empty origin
    if (!userId || !origin) return true
    // Allow the server's main domain
    if (origin === this.serverUri) return true
    // Allow the user's subdomain
    const userIdHost = userId.replace(/([^:/])\/.*/, '$1')
    if (origin === userIdHost) return true
    // Disallow everything else
    return false
  }

  /**
   * Returns the /authorize endpoint URL object (used in login requests, etc).
   *
   * @return {URL}
   */
  get authEndpoint () {
    return new URL('/authorize', this.serverUri)
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

  /**
   * Returns the protocol for an incoming request ('http' or 'https')
   * @returns {string}
   */
  protocol (req) {
    // Obtain the protocol from the configured server URI
    // (in case the server is running behind a reverse proxy)
    const protocol = this.serverUri.replace(/:.*/, '')
    return protocol || req.protocol
  }

  /**
   * Returns a fully qualified URL from an Express.js Request object.
   * (It's insane that Express does not provide this natively.)
   *
   * Usage:
   *
   *   ```
   *   console.log(host.parseTargetUrl(req))
   *   // -> https://example.com/path/to/resource?q1=v1
   *   ```
   *
   * @param req {IncomingRequest}
   *
   * @return {string}
   */
  parseTargetUrl (req) {
    const hostUrl = `${this.protocol(req)}://${req.get('host')}/`
    const fullPath = req.baseUrl === '/' ? req.path : req.baseUrl + req.path
    const url = new URL(fullPath, hostUrl)
    url.search = (new URLSearchParams(req.query)).toString()
    return url.toString()
    // return url.format({
    //   protocol: this.protocol(req),
    //   host: req.get('host'),
    //   pathname: url.resolve(req.baseUrl, ),
    //   query: req.query
    // })
  }
}

module.exports = ServerHost
