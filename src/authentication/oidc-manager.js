'use strict'

const { logger } = require('../logger')
const { URL } = require('url')
const validUrl = require('valid-url')
const ResourceAuthenticator = require('@solid/oidc-rs')
const { MultiRpClient } = require('./multi-rp-client')
const OIDCProvider = require('@interop-alliance/oidc-op')
const OIDCRelyingParty = require('@interop-alliance/oidc-rp')

const HostAPI = require('./host-api')
const { discoverProviderFor } = require('./preferred-provider')

class OidcManager {
  /**
   * @constructor
   * @param options {object} Options hashmap object
   *
   * @param options.storage {StorageManager}
   *
   * Config for OIDCProvider:
   * @param [options.providerUri] {string} Used for `iss`uer claim
   * @param [options.serverUri] {string} ResourceServer URI.
   *
   * Config for MultiRpClient:
   * @param [options.authCallbackUri] {string} e.g. '/api/oidc/rp'
   * @param [options.postLogoutUri] {string} e.g. '/goodbye'
   */
  constructor (options) {
    this.providerUri = options.providerUri
    this.serverUri = options.serverUri
    this.authCallbackUri = options.authCallbackUri
    this.postLogoutUri = options.postLogoutUri

    // ResourceServer instance
    this.rs = null
    // OIDCProvider instance
    this.provider = null

    // OIDC Clients store. Initialized in `initMultiRpClient()`
    this.clients = null

    this.storage = options.storage
    // Provider config store
    this.providerConfigStore = this.storage.op.config
    // User credentials store
    this.users = this.storage.users
  }

  /**
   * Factory method, returns an (un-initialized) instance of OidcManager.
   *
   * @param config {object} Options hashmap object
   *
   * @param config.host.serverUri {string}
   *
   * @param config.dbPath {string} Folder in which to store the
   *   auth-related collection stores (users, clients, tokens).
   *
   * Config for OIDCProvider:
   * @param config.providerUri {string} URI of the OpenID Connect Provider (iss)
   * @param config.serverUri {string} RS uri
   *
   * Config for MultiRpClient:
   * @param config.authCallbackUri {string}
   * @param config.postLogoutUri {string}
   *
   * @param storage {StorageManager}
   *
   * @throws {Error} If invalid oidc manager config.
   *
   * @return {OidcManager}
   */
  static from (config, storage) {
    const providerUri = config.providerUri || config.host.serverUri
    const authCallbackUri = (new URL('/api/oidc/rp', providerUri)).toString()
    const postLogoutUri = (new URL('/goodbye', providerUri)).toString()

    const options = {
      providerUri,
      serverUri: config.host.serverUri,
      storage,
      authCallbackUri: authCallbackUri,
      postLogoutUri: postLogoutUri
    }
    const oidc = new OidcManager(options)

    oidc.validate()

    return oidc
  }

  validate () {
    if (!this.serverUri) {
      throw new Error('serverUri is required')
    }
    if (!this.authCallbackUri) {
      throw new Error('authCallbackUri is required')
    }
    if (!this.postLogoutUri) {
      throw new Error('postLogoutUri is required')
    }
  }

  /**
   * Initializes on-disk resources required for OidcManager operation
   * (creates the various storage directories), and generates the provider's
   * crypto keychain (either from a previously generated and serialized config,
   * or from scratch).
   *
   * @return {Promise<RelyingParty>} Initialized local RP client
   */
  async initialize () {
    try {
      this.initMultiRpClient()
      this.initRs()
      await this.initProvider()

      const shouldSaveConfig = await this.initProviderKeychain()
      if (shouldSaveConfig) {
        await this.saveProviderConfig()
      }

      // await this.initLocalRpClient()
    } catch (error) {
      logger.error('Error initializing OidcManager:', error)
      throw error
    }
  }

  /**
   * Initializes public/private keychain for the OIDC Provider.
   * (This gets stored in provider config store.)
   *
   * @returns {Promise<boolean>}
   */
  async initProviderKeychain () {
    let shouldSaveConfig = true

    if (this.provider.keys) {
      logger.info('Provider keys loaded from config')
      shouldSaveConfig = false
    } else {
      logger.info('No provider keys found, generating fresh ones')
    }

    await this.provider.initializeKeyChain(this.provider.keys)
    logger.info('Provider keychain initialized')

    return shouldSaveConfig
  }

  /**
   * NOTE: Currently not being used; keeping here for a bit just in case need
   * to revert.
   *
   * Initializes the local Relying Party client (registered to this instance's
   * Provider). This acts as a cache warm up (proactively registers or loads
   * the client from saved config) so that the first API request that comes
   * along doesn't have to pause to do this. More importantly, it's used
   * to store the local RP client for use by the User
   * Consent screen and other components.
   *
   * @return {Promise<RelyingParty>}
   */
  // async initLocalRpClient () {
  //   try {
  //     const localClient = await this.clients.clientForIssuer(this.serverUri)
  //     logger.info('Local RP client initialized')
  //
  //     this.localRp = localClient
  //
  //     return localClient
  //   } catch (error) {
  //     logger.error('Error initializing local RP client: ', error)
  //     throw error
  //   }
  // }

  initMultiRpClient () {
    const localRPConfig = {
      issuer: this.providerUri,
      redirect_uri: this.authCallbackUri,
      post_logout_redirect_uris: [this.postLogoutUri]
    }

    const store = this.storage.rp
    store.modelClass = OIDCRelyingParty

    const clientOptions = {
      store,
      localConfig: localRPConfig
    }

    this.clients = new MultiRpClient(clientOptions)
  }

  initRs () {
    const rsConfig = { // oidc-rs
      defaults: {
        handleErrors: false,
        optional: true,
        query: true,
        realm: this.serverUri,
        allow: {
          // Restrict token audience to either this serverUri or its subdomain
          audience: (aud) => this.filterAudience(aud)
        }
      }
    }

    this.rs = new ResourceAuthenticator(rsConfig)
  }

  async initProvider () {
    const providerConfig = await this.loadProviderConfig()

    providerConfig.store = this.storage.op
    providerConfig.host = HostAPI

    this.provider = new OIDCProvider(providerConfig)
  }

  /**
   * Returns a previously serialized Provider config if one is available from
   * storage, otherwise returns a minimal config object (with just the `issuer`
   * set).
   *
   * @return {object}
   */
  async loadProviderConfig () {
    let providerConfig = {}

    const storedConfig = await this.providerConfigStore.get(this.providerUri)

    if (storedConfig) {
      providerConfig = storedConfig
    } else {
      providerConfig.issuer = this.providerUri
      providerConfig.serverUri = this.serverUri
    }

    return providerConfig
  }

  /**
   * Stores the provider config in config store (keyed by providerUri).
   *
   * @returns {Promise}
   */
  async saveProviderConfig () {
    return this.providerConfigStore.put(this.providerUri, this.provider)
  }

  /**
   * Extracts and verifies the Web ID URI from a set of claims (from the payload
   * of a bearer token).
   *
   * @see https://github.com/solid/webid-oidc-spec#webid-provider-confirmation
   *
   * @param claims {object} Claims hashmap, typically the payload of a decoded
   *   ID Token.
   *
   * @throws {Error}
   *
   * @returns {Promise<string|null>}
   */
  async webIdFromClaims (claims) {
    if (!claims) {
      return null
    }

    const webId = OidcManager.extractWebId(claims)

    const issuer = claims.iss

    const webidFromIssuer = OidcManager.domainMatches(issuer, webId)

    if (webidFromIssuer) {
      // easy case, issuer is in charge of the web id
      return webId
    }

    const preferredProvider = await discoverProviderFor(webId)

    // Otherwise, verify that issuer is the preferred OIDC provider for the web id
    if (preferredProvider === issuer) { // everything checks out
      return webId
    }

    throw new Error(`Preferred provider for Web ID ${webId} does not match token issuer ${issuer}`)
  }

  /**
   * Extracts the Web ID URI from a set of claims (from the payload of a bearer
   * token).
   *
   * @see https://github.com/solid/webid-oidc-spec#deriving-webid-uri-from-id-token
   *
   * @param claims {object} Claims hashmap, typically the payload of a decoded
   *   ID Token.
   *
   * @param claims.iss {string}
   * @param claims.sub {string}
   *
   * @param [claims.webid] {string}
   *
   * @throws {Error}
   *
   * @returns {string|null}
   */
  static extractWebId (claims) {
    let webId

    if (!claims) {
      throw new Error('Cannot extract Web ID from missing claims')
    }

    const issuer = claims.iss

    if (!issuer) {
      throw new Error('Cannot extract Web ID - missing issuer claim')
    }

    if (!claims.webid && !claims.sub) {
      throw new Error('Cannot extract Web ID - no webid or subject claim')
    }

    if (claims.webid) {
      webId = claims.webid
    } else {
      // Look to the subject claim to extract a webid uri
      if (validUrl.isUri(claims.sub)) {
        webId = claims.sub
      } else {
        throw new Error('Cannot extract Web ID - subject claim is not a valid URI')
      }
    }

    return webId
  }

  filterAudience (aud) {
    if (!Array.isArray(aud)) {
      aud = [aud]
    }

    return aud.some(a => OidcManager.domainMatches(this.serverUri, a))
  }

  /**
   * Tests whether a given Web ID uri belongs to the issuer. They must be:
   *   - either from the same domain origin
   *   - or the webid is an immediate subdomain of the issuer domain
   *
   * @param issuer {string}
   * @param webId {string}
   *
   * @returns {boolean}
   */
  static domainMatches (issuer, webId) {
    let match

    try {
      webId = new URL(webId)
      const webIdOrigin = webId.origin // drop the path

      match = (issuer === webIdOrigin) || OidcManager.isSubdomain(webIdOrigin, issuer)
    } catch (err) {
      match = false
    }

    return match
  }

  /**
   * @param subdomain {string} e.g. Web ID origin (https://alice.example.com)
   * @param domain {string} e.g. Issuer domain (https://example.com)
   *
   * @returns {boolean}
   */
  static isSubdomain (subdomain, domain) {
    subdomain = new URL(subdomain)
    domain = new URL(domain)

    if (subdomain.protocol !== domain.protocol) {
      return false // protocols must match
    }

    subdomain = subdomain.host // hostname + port, minus the protocol
    domain = domain.host

    // Chop off the first subdomain (alice.example.com -> example.com)
    const fragments = subdomain.split('.')
    fragments.shift()
    const abridgedSubdomain = fragments.join('.')

    return abridgedSubdomain === domain
  }
}

module.exports = {
  OidcManager
}
