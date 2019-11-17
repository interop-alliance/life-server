'use strict'
const { OIDCClientStore } = require('./client-store')
const OIDCRelyingParty = require('@interop-alliance/oidc-rp')
const { logger } = require('../logger')
const DEFAULT_MAX_AGE = 86400

class MultiRpClient {
  /**
   * @constructor
   * @param [localConfig={}] {Object}
   * @param [localConfig.issuer] {string}
   * @param [localConfig.redirect_uri] {string}
   * @param [localConfig.post_logout_redirect_uris] {Array<string>}
   *
   * Needed to initialize the ClientStore:
   *
   * @param [backend] {KVPFileStore} Either pass in a backend store
   * @param [path] {string} Or initialize the store from path.
   * @param [collectionName='clients'] {string}
   */
  constructor ({ store, backend, collectionName, path, localConfig = {} }) {
    this.store = store || new OIDCClientStore({ backend, collectionName, path })

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
      logger.error('Error in authUrlForIssuer(): ', error)
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
      // logger.info(`Client fetched for issuer ${issuerUri}`)
      return client
    }

    logger.info(`Client not present for issuer ${issuerUri}, initializing new client`)

    const registrationConfig = this.registrationConfigFor(issuerUri)

    const registeredClient = await this.registerClient(registrationConfig)
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
   * @param expressClient {OIDCRelyingParty}
   * @return {Promise<OIDCRelyingParty>}
   */
  persistClient (expressClient) {
    return this.store.put(expressClient)
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

  registerClient (config) {
    // logger.info('new OIDCRelyingParty.register()', config)
    logger.info('Registering new client for issuer ', config.issuer)

    return OIDCRelyingParty.register(config.issuer, config, {})
  }

  /**
   * @param issuer {string} URL of the OIDC Provider / issuer.
   * @param [config={}] {Object}
   */
  registrationConfigFor (issuer, config = {}) {
    const redirectUri = config.redirect_uri || this.redirectUriForIssuer(issuer)

    const defaultClientName = `Solid OIDC RP for ${issuer}`

    config.client_name = config.client_name || defaultClientName
    config.default_max_age = config.default_max_age || DEFAULT_MAX_AGE
    config.issuer = issuer
    config.grant_types = config.grant_types ||
      ['authorization_code', 'implicit', 'refresh_token', 'client_credentials']
    config.redirect_uris = config.redirect_uris || [redirectUri]
    config.response_types = config.response_types ||
      ['code', 'id_token token', 'code id_token token']
    config.post_logout_redirect_uris = config.post_logout_redirect_uris ||
      this.localConfig.post_logout_redirect_uris || []
    config.scope = config.scope || 'openid profile'
    // client_uri: 'https://github.com/solid/node-solid-server',
    // logo_uri: 'solid logo',
    // post_logout_redirect_uris: [ '...' ],
    return config
  }
}
module.exports = {
  MultiRpClient
}
