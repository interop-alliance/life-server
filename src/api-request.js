'use strict'

const { logger } = require('./logger')

/**
 * Base LifeServer http request.
 */
class ApiRequest {
  /**
   * @param options.host {ServerHost}
   * @param [options.requestUri] {string} Fully qualified request URL
   *   (parsed by `ServerHost.parseTargetUrl()`)
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.credentials=null] {object} Current session credentials.
   *
   * @param [options.accountManager] {AccountManager}
   * @param [options.storage] {StorageManager}
   */
  constructor (options) {
    this.requestUri = options.requestUri
    this.host = options.host
    this.response = options.response
    this.session = options.session || {}
    this.credentials = options.credentials || null

    this.accountManager = options.accountManager
    this.storage = options.storage || {}
    this.userStore = this.storage.users
  }

  /**
   * Base factory method.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   * @returns {Promise<ApiRequest>}
   */
  static fromIncoming (req, res) {
    const Request = this
    const options = Request.baseOptions(req, res)
    return new Request(options)
  }

  static baseOptions (req, res) {
    let host, accountManager, storage

    if (req.app && req.app.locals) {
      const locals = req.app.locals

      host = locals.host
      accountManager = locals.accountManager
      storage = locals.storage
    }

    const session = req.session || {}

    const { userId: webId } = session
    const credentials = {
      webId,
      username: webId && accountManager &&
        accountManager.usernameFromWebId(webId)
    }
    logger.info(`${req.method} ${req.originalUrl} w/ credentials: ` +
      JSON.stringify(credentials))
    const requestUri = host && host.parseTargetUrl(req)

    return {
      requestUri,
      response: res,
      session,
      host,
      accountManager,
      storage,
      credentials
    }
  }

  static get () {
    /**
     * @param req {IncomingRequest}
     * @param res {ServerResponse}
     * @param next {Function}
     */
    return async (req, res, next) => {
      try {
        const request = this.fromIncoming(req, res)
        await request.handleGet()
      } catch (error) {
        logger.error('Error in ApiRequest.get:' + error)
        next(error)
      }
    }
  }

  static post () {
    /**
     * @param req {IncomingRequest}
     * @param res {ServerResponse}
     * @param next {Function}
     */
    return async (req, res, next) => {
      try {
        const request = this.fromIncoming(req, res)
        await request.handlePost()
      } catch (error) {
        logger.error('Error in ApiRequest.post:' + error)
        next(error)
      }
    }
  }

  /**
   * Extracts a given parameter from the request - either from a GET query param,
   * a POST body param, or an express registered `/:param`.
   * Usage:
   *
   *   ```
   *   ApiRequest.parseParameter(req, 'client_id')
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

    logger.error(error)
    this.renderForm(error)
  }

  /**
   * Calls the appropriate form to display to the user.
   * Serves as an error handler for this request workflow.
   *
   * @param error {Error}
   */
  errorJson (error) {
    const statusCode = error.code || 400

    logger.error(error)
    this.response.status(statusCode).json({ message: error.message })
  }

  renderForm () {
    throw new Error('renderForm() must be implemented in a subclass.')
  }
}

module.exports = {
  ApiRequest
}
