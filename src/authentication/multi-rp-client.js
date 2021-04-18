'use strict'
const OIDCRelyingParty = require('@interop-alliance/oidc-rp')
const { logger } = require('../logger')
const DEFAULT_MAX_AGE = 86400

class MultiRpClient {
  /**
   * @constructor
   * @param store {FlexDocstore}
   * @param [localConfig={}] {object}
   * @param [localConfig.issuer] {string}
   * @param [localConfig.redirect_uri] {string}
   * @param [localConfig.post_logout_redirect_uris] {Array<string>}
   *
   */
  constructor ({ store, localConfig = {} }) {
    this.store = store
    this.localConfig = localConfig
  }

  /**
   * Returns the authorization (login) URL for a given OIDC client (which
   * is tied to / registered with a specific OIDC Provider).
   *
   * @method authUrl
   * @param client {RelyingParty}
   * @param session {Session} req.session or similar
   * @param workflow {string} OIDC workflow type, one of 'code' or 'implicit'.
   * @returns {Promise<string>} Absolute URL for an OIDC auth call (to start either
   *   the Authorization Code workflow, or the Implicit workflow).
   */
  async authUrl (client, session, workflow = 'code') {
    // let debug = this.debug
    const authParams = {
      // endpoint: 'signin',
      // response_mode: 'query',
      // response_mode: 'form_post',
      // client_id: client.client_id,
      redirect_uri: client.registration.redirect_uris[0]
      // state: '...',  // not doing state for the moment
      // scope: 'openid profile'
    }
    if (workflow === 'code') { // Authorization Code workflow
      authParams.response_type = 'code'
    } else if (workflow === 'implicit') {
      authParams.response_type = 'id_token token'
    }
    // console.log('client.createRequest(). client:', client.serialize())
    return client.createRequest(authParams, session)
  }

  /**
   * Returns a constructed `/authorization` URL for a given issuer. Used for
   * starting the OIDC workflow.
   *
   * @param issuer {string} OIDC Provider URL
   * @param workflow {string} OIDC workflow type, one of 'code' or 'implicit'
   * @returns {Promise<string>}
   */
  async authUrlForIssuer (issuer, session, workflow = 'code') {
    try {
      const client = await this.clientForIssuer(issuer)
      return this.authUrl(client, session, workflow)
    } catch (error) {
      logger.error('Error in authUrlForIssuer(): ' + error)
      throw error
    }
  }

  /**
   * @method clientForIssuer
   * @param issuerUri {string}
   * @returns {Promise<OIDCRelyingParty>}
   */
  async clientForIssuer (issuerUri) {
    const client = await this.loadClient(issuerUri)
    if (client) {
      logger.info(`Client fetched for issuer ${issuerUri}`)
      return client
    }

    logger.info(`Client not present for issuer ${issuerUri}, initializing new client`)

    const { registration, rpOptions } = this.registrationConfigFor(issuerUri)

    const registeredClient = await this.registerClient({ registration, rpOptions })
    return this.persistClient(registeredClient)
  }

  /**
   * @method loadClient
   * @param issuerUri {string}
   * @returns {Promise<OIDCRelyingParty>}
   */
  loadClient (issuerUri) {
    return this.store.get(issuerUri)
  }

  get localIssuer () {
    return this.localConfig.issuer
  }

  /**
   * @method persistClient
   * @param client {OIDCRelyingParty}
   * @return {Promise<OIDCRelyingParty>}
   */
  async persistClient (client) {
    const key = client.provider.url
    await this.store.put(key, client)
    return client
  }

  /**
   * @method redirectUriForIssuer
   * @param issuer {string} Issuer URI
   * @param baseUri {string}
   *
   * @throws {Error} If baseUri is missing.
   *
   * @return {string}
   */
  redirectUriForIssuer (issuerUri, baseUri = this.localConfig.redirect_uri) {
    if (!baseUri) {
      throw new Error('Cannot form redirect uri - base uri is missing')
    }
    const issuerId = encodeURIComponent(issuerUri)
    return `${baseUri}/${issuerId}`
  }

  registerClient ({ registration, rpOptions }) {
    logger.info('Registering new client for issuer ' + registration.issuer)

    return OIDCRelyingParty.register(registration.issuer, registration, rpOptions)
  }

  /**
   * @param issuer {string} URL of the OIDC Provider / issuer.
   * @param [registration={}] {object} Registration config object
   */
  registrationConfigFor (issuer, registration = {}) {
    const redirectUri = registration.redirect_uri || this.redirectUriForIssuer(issuer)

    const defaultClientName = `Life Server OIDC RP for ${issuer}`

    registration.client_name = registration.client_name || defaultClientName
    registration.default_max_age = registration.default_max_age || DEFAULT_MAX_AGE
    registration.issuer = issuer
    registration.grant_types = registration.grant_types ||
      ['authorization_code', 'implicit', 'refresh_token', 'client_credentials']
    registration.redirect_uris = registration.redirect_uris || [redirectUri]
    registration.response_types = registration.response_types ||
      ['code', 'id_token token', 'code id_token token']
    registration.post_logout_redirect_uris = registration.post_logout_redirect_uris ||
      this.localConfig.post_logout_redirect_uris || []
    registration.scope = registration.scope || 'openid profile'
    // client_uri: 'https://github.com/solid/node-solid-server',
    // logo_uri: 'solid logo',
    // post_logout_redirect_uris: [ '...' ],

    const rpOptions = {
      defaults: {
        authenticate: {
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: ['openid profile']
        }
      }
    }

    return { registration, rpOptions }
  }
}
module.exports = {
  MultiRpClient
}
