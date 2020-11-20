'use strict'

const { logger } = require('../../logger')
const validUrl = require('valid-url')
const { preferredProviderFor } = require('../preferred-provider')

class SelectProviderRequest {
  /**
   * @constructor
   *
   * @param options {Object}
   * @param [options.webId] {string}
   * @param [options.oidcManager] {OidcManager}
   * @param [options.response] {ServerResponse}
   * @param [options.serverUri] {string}
   * @param [options.returnToUrl] {string} Url of the original resource
   *   a client was trying to access before being redirected to select provider
   */
  constructor (options) {
    this.webId = options.webId
    this.oidcManager = options.oidcManager
    this.response = options.response
    this.session = options.session
    this.serverUri = options.serverUri
    this.returnToUrl = options.returnToUrl
  }

  /**
   * Validates the request and throws an error if invalid.
   *
   * @throws {Error} HTTP 400 if required parameters are missing
   */
  validate () {
    if (!this.webId) {
      const error = new Error('No webid is given for Provider Discovery')
      error.statusCode = 400
      throw error
    }

    if (!validUrl.isUri(this.webId)) {
      const error = new Error('Invalid webid given for Provider Discovery')
      error.statusCode = 400
      throw error
    }

    if (!this.oidcManager) {
      const error = new Error('OIDC multi-rp client not initialized')
      error.statusCode = 500
      throw error
    }
  }

  /**
   * Factory method, creates and returns an initialized and validated instance
   * of SelectProviderRequest from a submitted POST form.
   *
   * @param req {IncomingRequest}
   * @param [req.body.webid] {string}
   *
   * @param res {ServerResponse}

   * @return {SelectProviderRequest}
   */
  static fromParams (req, res) {
    const body = req.body || {}
    const query = req.query || {}
    const webId = SelectProviderRequest.normalizeUri(body.webid)

    let oidcManager, serverUri
    if (req.app && req.app.locals) {
      const locals = req.app.locals
      oidcManager = locals.oidc
      serverUri = locals.host.serverUri
    }

    const options = {
      webId,
      oidcManager,
      serverUri,
      returnToUrl: query.returnToUrl,
      response: res,
      session: req.session
    }

    return new SelectProviderRequest(options)
  }

  /**
   * Attempts to return a normalized URI by prepending `https://` to a given
   * value, if a protocol is missing.
   *
   * @param uri {string}
   *
   * @return {string}
   */
  static normalizeUri (uri) {
    if (!uri) {
      return uri
    }

    if (!uri.startsWith('http')) {
      uri = 'https://' + uri
    }

    return uri
  }

  /**
   * Handles the Select Provider POST request. Usage:
   *
   *   ```
   *   app.post('/api/auth/select-provider', bodyParser, SelectProviderRequest.post })
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @throws {Error}
   *
   * @return {Promise}
   */
  static async post (req, res) {
    const request = SelectProviderRequest.fromParams(req, res)

    return SelectProviderRequest.handlePost(request)
  }

  static async handlePost (request) {
    try {
      request.validate() // throws error if invalid
      request.saveReturnToUrl()
      await request.selectProvider()
    } catch (error) {
      // console.error(error)
      request.error(error)
    }
  }

  /**
   * Handles a Select Provider GET request on behalf of a middleware handler. Usage:
   *
   *   ```
   *   app.get('/api/auth/select-provider', SelectProviderRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static get (req, res) {
    const request = SelectProviderRequest.fromParams(req, res)

    request.renderView()
  }

  /**
   * Performs provider discovery by determining a user's preferred provider uri,
   * constructing an authentication url for that provider, and redirecting the
   * user to it.
   *
   * @throws {Error}
   *
   * @return {Promise}
   */
  async selectProvider () {
    const providerUrl = await this.preferredProviderUrl()
    logger.info('Building /authorize url for provider: ' + providerUrl)

    const providerAuthUrl = await this.authUrlFor(providerUrl)

    logger.info('/authorize url:' + providerAuthUrl)

    return this.response.redirect(providerAuthUrl)
  }

  /**
   * Saves `returnToUrl` param for later use in AuthCallbackRequest handler,
   * to redirect the client to the original resource they were trying to access
   * before entering the authn workflow.
   */
  saveReturnToUrl () {
    this.session.returnToUrl = this.returnToUrl
  }

  /**
   * @throws {Error}
   *
   * @returns {Promise<string>} Resolves to the preferred OIDC provider for
   *   the url the user entered
   */
  preferredProviderUrl () {
    logger.info('Discovering provider for uri: ' + this.webId)

    return preferredProviderFor(this.webId)
  }

  /**
   * Constructs the OIDC authorization URL for a given provider.
   *
   * @param providerUri {string} Identity provider URI
   *
   * @return {Promise<string>}
   */
  authUrlFor (providerUri) {
    const multiRpClient = this.oidcManager.clients

    return multiRpClient.authUrlForIssuer(providerUri, this.session)
  }

  error (error) {
    const res = this.response

    res.status(error.statusCode || 400)

    res.render('auth/select-provider', { error: error.message })
  }

  renderView () {
    const res = this.response

    res.render('auth/select-provider', { serverUri: this.serverUri })
  }
}

module.exports = SelectProviderRequest
