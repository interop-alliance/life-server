'use strict'

const url = require('url')
const { logger } = require('../../logger')
const HttpError = require('standard-http-error')

class AuthCallbackRequest {
  constructor (options) {
    this.requestUri = options.requestUri
    this.issuer = options.issuer
    this.oidcManager = options.oidcManager
    this.response = options.response
    this.session = options.session
    this.returnToUrl = options.returnToUrl || '/'
    this.serverUri = options.serverUri
  }

  /**
   * Usage:
   *
   *   ```
   *   router.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   * @param next {Function}
   *
   * @returns {Promise}
   */
  static async get (req, res, next) {
    const request = AuthCallbackRequest.fromParams(req, res)

    try {
      await AuthCallbackRequest.handle(request)
    } catch (error) {
      logger.error('Error in AuthCallbackRequest.get:', error)
      next(error)
    }
  }

  /**
   * Factory method, creates and returns an initialized and validated instance
   * of AuthCallbackRequest from a redirected GET request.
   *
   * @param req {IncomingRequest}
   *
   * @param res {ServerResponse}

   * @return {AuthCallbackRequest}
   */
  static fromParams (req, res) {
    let oidcManager, serverUri
    if (req.app && req.app.locals) {
      const locals = req.app.locals
      oidcManager = locals.oidc
      serverUri = locals.host.serverUri
    }

    const requestUri = AuthCallbackRequest.fullUriFor(req)
    const issuer = AuthCallbackRequest.extractIssuer(req)

    const options = {
      issuer,
      requestUri,
      oidcManager,
      serverUri,
      returnToUrl: req.session.returnToUrl,
      response: res,
      session: req.session
    }

    return new AuthCallbackRequest(options)
  }

  static fullUriFor (req) {
    return url.format({
      protocol: req.protocol,
      host: req.get('host'),
      pathname: req.path,
      query: req.query
    })
  }

  /**
   * Exchanges authorization code for id token
   * @param request
   *
   * @throws {HttpError}
   *
   * @returns {Promise}
   */
  static async handle (request) {
    request.validate()
    const rpClient = await request.loadClient()
    const session = await request.validateResponse(rpClient)
    await request.initSessionUserAuth(session)

    request.resumeUserWorkflow()
  }

  static extractIssuer (req) {
    return req.params && decodeURIComponent(req.params.issuer_id)
  }

  validate () {
    if (!this.issuer) {
      throw new HttpError(400, 'Issuer id is missing from request params')
    }
  }

  async loadClient () {
    const rpClientStore = this.oidcManager.clients

    return rpClientStore.clientForIssuer(this.issuer)
  }

  /**
   * @param rpSession {Session} RelyingParty Session object
   *
   * @throws {HttpError}
   *
   * @returns {Promise}
   */
  async initSessionUserAuth (rpSession) {
    try {
      const webId = await this.oidcManager.webIdFromClaims(rpSession.idClaims)
      this.session.userId = webId
      this.session.credentials = {
        webId,
        idClaims: rpSession.idClaims,
        authorization: rpSession.authorization
      }
    } catch (err) {
      const error = new HttpError(401, 'Could not verify Web ID from token claims')
      error.cause = err
      error.info = { credentials: this.session.credentials }
      throw error
    }
  }

  /**
   * Validates the authentication response and decodes the credentials.
   * Also performs auth code exchange (trading an authorization code for an
   * id token and access token), if applicable.
   *
   * @param client {RelyingParty}
   *
   * @throws {HttpError}
   *
   * @return {Promise<Session>} Containing the `idToken` and `accessToken` properties
   */
  async validateResponse (client) {
    let session

    try {
      session = await client.validateResponse(this.requestUri, this.session)
    } catch (error) {
      throw new HttpError(400, 'Error in callback/validateResponse: ' + error)
    }

    return session
  }

  /**
   * Redirects the user back to their original requested resource, at the end
   * of the OIDC authentication process.
   */
  resumeUserWorkflow () {
    logger.info('  Resuming workflow, redirecting to ' + this.returnToUrl)

    delete this.session.returnToUrl

    return this.response.redirect(302, this.returnToUrl)
  }
}

module.exports = AuthCallbackRequest
