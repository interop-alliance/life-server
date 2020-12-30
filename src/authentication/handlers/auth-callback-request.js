'use strict'

const { logger } = require('../../logger')
const HttpError = require('standard-http-error')
const { ApiRequest } = require('../../api-request')

class AuthCallbackRequest extends ApiRequest {
  constructor (options) {
    super(options)
    this.issuer = options.issuer
    this.oidcManager = options.oidcManager
    this.returnToUrl = options.returnToUrl || '/'
    this.serverUri = options.serverUri
  }

  /**
   * Factory method, creates and returns an initialized instance
   * of AuthCallbackRequest from a redirected GET request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}

   * @return {AuthCallbackRequest}
   */
  static fromIncoming (req, res) {
    const options = ApiRequest.baseOptions(req, res)

    const locals = req.app.locals
    const { host: { serverUri }, oidc: oidcManager } = locals

    options.issuer = AuthCallbackRequest.extractIssuer(req)
    options.oidcManager = oidcManager
    options.serverUri = serverUri
    options.returnToUrl = req.session.returnToUrl

    return new AuthCallbackRequest(options)
  }

  /**
   * Handles GET request, exchanges authorization code for id token.
   *
   * Usage:
   *   ```
   *   router.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get())
   *   ```
   */
  async handleGet () {
    try {
      this.validate()
      const rpClient = await this.loadClient()
      const session = await this.validateResponse(rpClient)
      await this.initSessionUserAuth(session)

      this.resumeUserWorkflow()
    } catch (error) {
      this.error(error)
    }
  }

  error (error) {
    logger.error('Error in AuthCallbackRequest.get:' + error)
    throw error // re-throw (passed onto Express middleware next()).
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
