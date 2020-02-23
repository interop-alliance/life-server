'use strict'

const path = require('path')
const { logger } = require('../logger')
const { URL } = require('url')
const validUrl = require('valid-url')
const ResourceAuthenticator = require('@solid/oidc-rs')
const { FlexDocStore } = require('flex-docstore')
const { MultiRpClient } = require('./multi-rp-client')
const OIDCProvider = require('@interop-alliance/oidc-op')
const OIDCRelyingParty = require('@interop-alliance/oidc-rp')
const { UserCredentialStore } = require('./user-credential-store')

const HostAPI = require('./host-api')
const { discoverProviderFor } = require('./preferred-provider')

const DEFAULT_DB_PATH = './db/oidc'

class OidcManager {
  /**
   * @constructor
   * @param options {Object} Options hashmap object
   *
   * @param [options.storePaths] {Object}
   * @param [options.storePaths.multiRpStore] {string}
   * @param [options.storePaths.providerStore] {string}
   * @param [options.storePaths.userStore] {string}
   *
   * Config for OIDCProvider:
   * @param [options.serverUri] {string} URI of this peer node, will be used
   *   as both the Provider URI (`iss`) and the ResourceServer URI.
   *
   * @param [options.host] {Object} Injected host behavior object
   * @param [options.host.authenticate] {Function}
   * @param [options.host.obtainConsent] {Function}
   * @param [options.host.logout] {Function}
   *
   * Config for MultiRpClient:
   * @param [options.authCallbackUri] {string} e.g. '/api/oidc/rp'
   * @param [options.postLogoutUri] {string} e.g. '/goodbye'
   *
   * Config for UserCredentialStore:
   * @param [options.saltRounds] {number} Number of bcrypt password salt rounds
   *
   * @param [options.delayBeforeRegisteringInitialClient] {number} Number of
   *   milliseconds to delay before initializing a local RP client.
   */
  constructor (options) {
    this.storePaths = options.storePaths

    this.providerUri = options.serverUri
    this.serverUri = options.serverUri
    this.host = options.host

    this.authCallbackUri = options.authCallbackUri
    this.postLogoutUri = options.postLogoutUri

    this.saltRounds = options.saltRounds

    this.rs = null
    this.clients = null
    // this.localRp = null
    this.provider = null
    this.providerStore = FlexDocStore.using('files',
      { dir: path.join(this.storePaths.providerStore, 'provider') })
    this.users = null

    this.delayBeforeRegisteringInitialClient = options.delayBeforeRegisteringInitialClient
  }

  /**
   * Factory method, returns an (un-initialized) instance of OidcManager.
   *
   * @param config {Object} Options hashmap object
   *
   * @param [config.dbPath='./db/oidc'] {string} Folder in which to store the
   *   auth-related collection stores (users, clients, tokens).
   *
   * Config for OIDCProvider:
   * @param config.serverUri {string} URI of the OpenID Connect Provider
   * @param [config.host] {Object} Injected host behavior object.
   *
   * Config for MultiRpClient:
   * @param config.authCallbackUri {string}
   * @param config.postLogoutUri {string}
   *
   * Config for UserCredentialStore:
   * @param [config.saltRounds] {number} Number of bcrypt password salt rounds
   *
   * @param [config.delayBeforeRegisteringInitialClient] {number} Number of
   *   milliseconds to delay before initializing a local RP client.
   *
   * @throws {Error} If invalid oidc manager config.
   *
   * @return {OidcManager}
   */
  static from (config) {
    const options = {
      providerUri: config.serverUri || config.providerUri,
      serverUri: config.serverUri || config.providerUri,
      host: config.host,
      authCallbackUri: config.authCallbackUri,
      postLogoutUri: config.postLogoutUri,
      saltRounds: config.saltRounds,
      delayBeforeRegisteringInitialClient: config.delayBeforeRegisteringInitialClient,
      storePaths: OidcManager.storePathsFrom(config.dbPath)
    }
    const oidc = new OidcManager(options)

    oidc.validate()

    return oidc
  }

  /**
   * Returns an instance of the OIDC Authentication Manager, initialized from
   * argv / config.js server parameters.
   *
   * @param argv {Object} Config hashmap
   *
   * @param argv.host {SolidHost} Initialized SolidHost instance, including
   *   `serverUri`.
   *
   * @param [argv.dbPath='./db/oidc'] {string} Path to the auth-related storage
   *   directory (users, tokens, client registrations, etc, will be stored there).
   *
   * @param argv.saltRounds {number} Number of bcrypt password salt rounds
   *
   * @param [argv.delayBeforeRegisteringInitialClient] {number} Number of
   *   milliseconds to delay before initializing a local RP client.
   *
   * @return {OidcManager} Initialized instance, includes a UserCredentialStore,
   *   OIDC Clients store, a Resource Authenticator, and an OIDC Provider.
   */
  static fromServerConfig (argv) {
    const providerUri = argv.host.serverUri
    const authCallbackUri = (new URL('/api/oidc/rp', providerUri)).toString()
    const postLogoutUri = (new URL('/goodbye', providerUri)).toString()

    const dbPath = path.join(argv.dbPath, 'oidc')

    const options = {
      providerUri,
      dbPath,
      authCallbackUri,
      postLogoutUri,
      saltRounds: argv.saltRounds,
      delayBeforeRegisteringInitialClient: argv.delayBeforeRegisteringInitialClient,
      host: HostAPI
    }

    return OidcManager.from(options)
  }

  static storePathsFrom (dbPath = DEFAULT_DB_PATH) {
    // Assuming dbPath = 'db/oidc'
    return {
      // RelyingParty client store path (results in 'db/oidc/rp/clients')
      multiRpStore: path.resolve(dbPath, 'rp', 'clients'),

      // User store path (results in 'db/oidc/user/['users', 'users-by-email'])
      userStore: path.resolve(dbPath, 'users'),

      // Identity Provider store path (db/oidc/op/['codes', 'clients', 'tokens', 'refresh'])
      providerStore: path.resolve(dbPath, 'op')
    }
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
      this.initUserCredentialStore()
      await this.initProvider()

      const shouldSaveConfig = await this.initProviderKeychain()
      if (shouldSaveConfig) {
        await this.saveProviderConfig()
      }

      await this.sleepIfNeeded()

      // await this.initLocalRpClient()
    } catch (error) {
      logger.error('Error initializing OidcManager:', error)
      throw error
    }
  }

  /**
   * @returns {Promise}
   */
  async sleepIfNeeded () {
    // Use-case: if solid server is deployed behind a load-balancer
    // (e.g. F5, Nginx) there may be a delay between
    // when the server starting up and the load balancer detected that it's
    // up, which would cause failures when the
    // solid server is trying to register an **its own local** initial
    // RP client (i.e. the it won't see itself and
    // we'll get an ECONNRESET error!).
    if (this.delayBeforeRegisteringInitialClient) {
      logger.info(`Sleeping for ${this.delayBeforeRegisteringInitialClient} milliseconds`)
      return new Promise(resolve =>
        setTimeout(resolve, this.delayBeforeRegisteringInitialClient))
    } else {
      logger.info('Not sleeping before client registration...')
    }
  }

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

    const store = FlexDocStore.using(
      'files',
      {
        dir: this.storePaths.multiRpStore,
        modelClass: OIDCRelyingParty
      })

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

  initUserCredentialStore () {
    const userStoreConfig = {
      backendType: 'files',
      saltRounds: this.saltRounds,
      path: this.storePaths.userStore
    }
    this.users = UserCredentialStore.from(userStoreConfig)
  }

  async initProvider () {
    const providerConfig = await this.loadProviderConfig()

    providerConfig.store = {
      codes: FlexDocStore.using('memory'),
      clients: FlexDocStore.using('memory'),
      tokens: FlexDocStore.using('memory'),
      refresh: FlexDocStore.using('memory')
    }

    providerConfig.host = this.host || HostAPI

    this.provider = new OIDCProvider(providerConfig)
  }

  /**
   * Returns a previously serialized Provider config if one is available on disk,
   * otherwise returns a minimal config object (with just the `issuer` set).
   *
   * @return {Object}
   */
  async loadProviderConfig () {
    let providerConfig = {}

    const storedConfig = await this.providerStore.get(this.providerUri)

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
    return this.providerStore.put(this.providerUri, this.provider)
  }

  /**
   * Extracts and verifies the Web ID URI from a set of claims (from the payload
   * of a bearer token).
   *
   * @see https://github.com/solid/webid-oidc-spec#webid-provider-confirmation
   *
   * @param claims {Object} Claims hashmap, typically the payload of a decoded
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
   * @param claims {Object} Claims hashmap, typically the payload of a decoded
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

    // Chop off the first subdomain (alice.databox.me -> databox.me)
    const fragments = subdomain.split('.')
    fragments.shift()
    const abridgedSubdomain = fragments.join('.')

    return abridgedSubdomain === domain
  }
}

module.exports = {
  OidcManager
}
