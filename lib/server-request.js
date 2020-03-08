'use strict'

// const { logger } = require('./logger')

/**
 * Base LifeServer http request.
 */
class ServerRequest {
  /**
   * @param options.host {ServerHost}
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.credentials=null] {object} Current session credentials.
   *
   * @param [options.accountManager] {AccountManager}
   * @param [options.storage] {StorageManager}
   */
  constructor (options) {
    this.host = options.host
    this.response = options.response
    this.session = options.session || {}
    this.credentials = options.credentials || null

    this.accountManager = options.accountManager
    this.storage = options.storage || {}
    this.userStore = this.storage.users
  }

  /**
   * Extracts a given parameter from the request - either from a GET query param,
   * a POST body param, or an express registered `/:param`.
   * Usage:
   *
   *   ```
   *   ServerRequest.parseParameter(req, 'client_id')
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
   * Calls the appropriate form to display to the user.
   * Serves as an error handler for this request workflow.
   *
   * @param error {Error}
   */
  error (error) {
    error.statusCode = error.statusCode || 400

    this.renderForm(error)
  }

  renderForm () {
    throw new Error('renderForm() must be implemented in a subclass.')
  }
}

module.exports = {
  ServerRequest: ServerRequest
}
