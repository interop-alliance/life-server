'use strict'

const AuthResponseSent = require('../errors/auth-response-sent')
const { URL, URLSearchParams } = require('url')

class LoginConsentRequest {
  constructor (options) {
    this.opAuthRequest = options.opAuthRequest
    this.params = options.params
    this.response = options.response
  }

  /**
   * @param opAuthRequest {OPAuthenticationRequest}
   * @param skipConsent {boolean}
   *
   * @return {Promise<OPAuthenticationRequest>}
   */
  static async handle (opAuthRequest, skipConsent = false) {
    const notLoggedIn = !opAuthRequest.subject
    if (notLoggedIn) {
      return opAuthRequest // pass through
    }

    const consentRequest = LoginConsentRequest.from(opAuthRequest)

    if (skipConsent) {
      consentRequest.markConsentSuccess(opAuthRequest)
      return opAuthRequest // pass through
    }

    return LoginConsentRequest.obtainConsent(consentRequest)
  }

  /**
   * @param opAuthRequest {OPAuthenticationRequest}
   *
   * @return {LoginConsentRequest}
   */
  static from (opAuthRequest) {
    const params = LoginConsentRequest.extractParams(opAuthRequest)

    const options = {
      opAuthRequest,
      params,
      response: opAuthRequest.res
    }

    return new LoginConsentRequest(options)
  }

  static extractParams (opAuthRequest) {
    const req = opAuthRequest.req
    const query = req.query || {}
    const body = req.body || {}
    const params = query.client_id ? query : body
    return params
  }

  /**
   * @param consentRequest {LoginConsentRequest}
   *
   * @return {Promise<OPAuthenticationRequest>}
   */
  static async obtainConsent (consentRequest) {
    const { opAuthRequest, clientId } = consentRequest

    const parsedAppOrigin = new URL(consentRequest.opAuthRequest.params.redirect_uri)
    const appOrigin = `${parsedAppOrigin.protocol}//${parsedAppOrigin.host}`

    // Consent for the local RP client (the home pod) is implied
    if (consentRequest.isLocalRpClient(appOrigin)) {
      consentRequest.markConsentSuccess(opAuthRequest)
      return opAuthRequest
    }

    // Check if user has submitted this from a Consent page
    if (consentRequest.hasAlreadyConsented(appOrigin)) {
      await consentRequest.saveConsentForClient(clientId)
      consentRequest.markConsentSuccess(opAuthRequest)
      return opAuthRequest
    }

    // Otherwise, need to obtain explicit consent from the user via UI
    const priorConsent = await consentRequest.checkSavedConsentFor(clientId)
    if (priorConsent) {
      consentRequest.markConsentSuccess(opAuthRequest)
    } else {
      consentRequest.redirectToConsent()
    }
    return opAuthRequest
  }

  /**
   * @return {string}
   */
  get clientId () {
    return this.params.client_id
  }

  isLocalRpClient (appOrigin) {
    // FIXME
    // return this.opAuthRequest.req.app.locals.host.serverUri === appOrigin
    return true
  }

  hasAlreadyConsented (appOrigin) {
    return true
    // return this.opAuthRequest.req.session.consentedOrigins &&
    //   this.opAuthRequest.req.session.consentedOrigins.includes(appOrigin)
  }

  async checkSavedConsentFor (opAuthRequest) {
    return true
  }

  markConsentSuccess (opAuthRequest) {
    opAuthRequest.consent = true
    opAuthRequest.scope = this.params.scope
  }

  async saveConsentForClient (clientId) {
    return clientId
  }

  redirectToConsent (authRequest) {
    const { opAuthRequest } = this
    const consentUrl = new URL('/sharing', authRequest.provider.issuer)
    consentUrl.search = (new URLSearchParams(opAuthRequest.req.query)).toString()

    opAuthRequest.subject = null

    opAuthRequest.res.redirect(consentUrl.toString())

    this.signalResponseSent()
  }

  signalResponseSent () {
    throw new AuthResponseSent('User redirected')
  }
}

module.exports = LoginConsentRequest
