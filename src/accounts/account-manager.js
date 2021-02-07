'use strict'

const { URL } = require('url')
const defaults = require('../defaults')
const UserAccount = require('./user-account')
const { AccountTemplate } = require('./account-template')
const { LdpTarget } = require('../storage/ldp-target')
const { logger } = require('../logger')
const { generateDid, didForWebId, didKeys, keySuite, didWebDocumentLoader } = require('./dids')
const { escapeDidForFilename } = require('../storage/storage-manager')

const { ACL_SUFFIX } = require('../defaults')
const DEFAULT_ADMIN_USERNAME = 'admin'

/**
 * Manages account creation (determining whether accounts exist, creating
 * directory structures for new accounts, saving credentials).
 *
 * @class AccountManager
 */
class AccountManager {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.authMethod='oidc'] {string} Primary authentication method
   * @param [options.emailService] {EmailService}
   * @param [options.tokenService] {TokenService}
   * @param [options.host] {ServerHost}
   * @param [options.storage] {StorageManager}
   * @param [options.pathCard] {string}
   * @param [options.suffixURI] {string}
   * @param [options.accountTemplatePath] {string} Path to the account template
   *   directory (will be used as a template for default containers, etc, when
   *   creating new accounts).
   */
  constructor (options = {}) {
    if (!options.host) {
      throw Error('AccountManager requires a host instance.')
    }
    this.host = options.host
    this.emailService = options.emailService
    this.tokenService = options.tokenService
    this.authMethod = options.authMethod || defaults.auth
    this.pathCard = options.pathCard || 'web'
    this.suffixURI = options.suffixURI || '#id'
    this.accountTemplatePath = options.accountTemplatePath ||
      './default-templates/new-account/'

    this.storage = options.storage || {}
    this.accountStorage = this.storage.accountStorage
  }

  /**
   * Is the server running in multiuser mode (users can sign up for accounts)
   *   or single user (such as a personal website).
   * @returns {boolean}
   */
  get multiuser () {
    return this.host.multiuser
  }

  /**
   * Factory method for new account manager creation. Usage:
   *
   * @param [options={}] {Object} See the `constructor()` docstring.
   *
   * @return {AccountManager}
   */
  static from (options) {
    return new AccountManager(options)
  }

  /**
   * Tests whether an account already exists for a given username.
   * Usage:
   *
   *   ```
   *   const exists = await accountManager.accountExists('alice')
   *   ```
   * @param accountName {string} Account username, e.g. 'alice'
   *
   * @return {Promise<boolean>}
   */
  async accountExists (accountName) {
    const accountUrl = this.accountUriFor(accountName)

    return this.accountUrlExists(accountUrl)
  }

  /**
   * Tests whether a given account URI (e.g. 'https://alice.example.com/')
   * already exists on the server (by testing the root account .acl).
   *
   * Historical note:
   * The reason this method tests the root .acl for existence, and not simply
   * for the existence of the root container, has to do with the fact that this
   * server began as a web-enabled file server. It was meant to be used in
   * single-user mode, where users would just point the server at an existing
   * directory. Account registration and init mode would not be able to simply
   * test for the root directory's existence, but had to check whether the
   * directory was properly initialized as a Solid storage dir (with the root
   * .acl resource etc).
   *
   * @param accountUrl {string}
   *
   * @return {Promise<boolean>}
   */
  async accountUrlExists (accountUrl) {
    const target = new LdpTarget({ url: accountUrl })
    target.ensureTrailingSlash()

    const rootAcl = new LdpTarget({ url: target.aclUrl })

    logger.info(`Checking if account url ${accountUrl} exists at ${rootAcl.url}`)

    return this.accountStorage.exists({ target: rootAcl })
  }

  /**
   * Composes an account URI for a given account name.
   * Usage (given a host with serverUri of 'https://example.com'):
   *
   *   ```
   *   // in multi user mode:
   *   acctMgr.accountUriFor('alice')
   *   // -> 'https://alice.example.com'
   *
   *   // in single user mode:
   *   acctMgr.accountUriFor()
   *   // -> 'https://example.com'
   *   ```
   *
   * @param [accountName] {string}
   *
   * @throws {Error} If `this.host` has not been initialized with serverUri,
   *   or if in multiuser mode and accountName is not provided.
   * @return {string}
   */
  accountUriFor (accountName) {
    const accountUri = this.multiuser
      ? this.host.accountUriFor(accountName)
      : this.host.serverUri // single user mode

    return accountUri
  }

  /**
   * Composes a WebID (uri with hash fragment) for a given account name.
   * Usage:
   *
   *   ```
   *   // in multi user mode:
   *   acctMgr.accountWebIdFor('alice')
   *   // -> 'https://alice.example.com/web#id'
   *
   *   // in single user mode:
   *   acctMgr.accountWebIdFor()
   *   // -> 'https://example.com/web#id'
   *   ```
   *
   * @param [accountName] {string}
   *
   * @throws {Error} via accountUriFor()
   *
   * @return {string|null}
   */
  accountWebIdFor (accountName) {
    const accountUri = this.accountUriFor(accountName)

    const webIdUri = new URL(this.pathCard, accountUri)

    webIdUri.hash = this.suffixURI
    return webIdUri.toString()
  }

  /**
   * Returns the root .acl URI for a given user account (the account recovery
   * email is stored there).
   *
   * @param userAccount {UserAccount}
   *
   * @throws {Error} via accountUriFor()
   *
   * @return {string} Root .acl URI
   */
  rootAclFor (userAccount) {
    const accountUri = this.accountUriFor(userAccount.username)

    return (new URL(ACL_SUFFIX, accountUri)).toString()
  }

  /**
   * Assembles and returns the signature key suite (proof purpose of
   * `assertionMethod`), used for signing Verifiable Credentials and
   * Verifiable Presentations.
   *
   * @throws {Error} If unsupported key type.
   *
   * @param webId {string}
   * @parma purpose {string} E.g. 'authentication', 'assertionMethod' etc.
   */
  async signingKey ({ webId, purpose }) {
    const did = didForWebId({ webId })
    const user = UserAccount.from({ webId })
    const { accountUri } = user
    const didKeys = await this.loadKeys({
      accountUri, did
    })
    const didDocument = await this.loadDidDocument({ accountUri })

    const signingKeyId = didDocument[purpose][0].id
    const signingKey = didKeys[signingKeyId]
    const suite = keySuite({ key: signingKey })

    const documentLoader = didWebDocumentLoader({ didDocument, didKeys })

    return { did, suite, documentLoader }
  }

  /**
   * Creates and returns a `UserAccount` instance from submitted user data
   * (typically something like `req.body`, from a signup form).
   *
   * @param userData {Object} Options hashmap, like `req.body`.
   *   Either a `username` or a `webid` property is required.
   *
   * @param [userData.username] {string}
   * @param [userData.webid] {string}
   *
   * @param [userData.email] {string}
   * @param [userData.name] {string}
   *
   * @throws {Error} (via `accountWebIdFor()`) If in multiuser mode and no
   *   username passed
   *
   * @return {UserAccount}
   */
  userAccountFrom (userData) {
    const userConfig = {
      username: userData.username,
      email: userData.email,
      name: userData.name,
      externalWebId: userData.externalWebId,
      localAccountId: userData.localAccountId,
      webId: userData.webid || userData.webId || userData.externalWebId
    }

    try {
      userConfig.webId = userConfig.webId ||
        this.accountWebIdFor(userConfig.username)
    } catch (err) {
      if (err.message === 'Cannot construct uri for blank account name') {
        throw new Error('Username or web id is required')
      } else {
        throw err
      }
    }

    if (userConfig.username) {
      if (userConfig.externalWebId && !userConfig.localAccountId) {
        // External Web ID exists, derive the local account id from username
        userConfig.localAccountId = this.accountWebIdFor(userConfig.username)
          .split('//')[1] // drop the https://
      }
    } else { // no username - derive it from web id
      if (userConfig.externalWebId) {
        userConfig.username = userConfig.externalWebId
      } else {
        userConfig.username = this.usernameFromWebId(userConfig.webId)
      }
    }

    return UserAccount.from(userConfig)
  }

  usernameFromWebId (webId) {
    if (!this.multiuser) {
      return DEFAULT_ADMIN_USERNAME
    }

    const profileUrl = new URL(webId)
    const hostname = profileUrl.hostname

    return hostname.split('.')[0]
  }

  /**
   * Creates the root storage folder, initializes default containers and
   * resources for the new account.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @throws {Error} If errors were encountering while creating new account
   *   resources.
   *
   * @return {Promise<UserAccount>} Chainable
   */
  async provisionAccount ({ userAccount }) {
    const { storage: { collectionManager } } = this

    await this.provisionAccountStorage(userAccount)

    if (this.host.features.provisionDidOnSignup) {
      await this.provisionAccountDid({ userAccount })
    }

    if (collectionManager) {
      await collectionManager.createDefaultCollections(userAccount)
    }

    logger.info('Account provisioned')

    return userAccount
  }

  /**
   * Creates user account storage (default containers etc) from a default
   * account template.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  async provisionAccountStorage (userAccount) {
    try {
      const { accountStorage, host } = this
      const template = AccountTemplate.for({ userAccount, host, accountStorage })

      const templatePath = this.accountTemplatePath

      logger.info(`Creating account folder for ${userAccount.webId} at ${userAccount.accountUri}`)

      return template.provisionAccountFrom({
        templatePath,
        accountUrl: userAccount.accountUri
      })
    } catch (error) {
      error.message = 'Error creating account storage: ' + error.message
      throw error
    }
  }

  async provisionAccountDid ({ userAccount }) {
    const { accountUri } = userAccount

    try {
      const { didDocument, didKeys } = await generateDid({ url: accountUri })
      const did = didDocument.id
      logger.info(`User DID generated: '${did}'.`)

      await this.saveDidDocument({ accountUri, didDocument })
      await this.saveKeys({ accountUri, did, didKeys })
    } catch (error) {
      error.message = 'Error generating user DID: ' + error.message
      throw error
    }
  }

  async saveDidDocument ({ accountUri, didDocument }) {
    const { accountStorage } = this
    const didDocLocation = new URL('/.well-known/did.json', accountUri)
    const target = new LdpTarget({ url: didDocLocation.toString() })
    const resource = await accountStorage.resource({ target })
    await accountStorage.writeBlob({
      resource,
      blob: JSON.stringify(didDocument, null, 2)
    })
    logger.info('User DID written to: ' + resource.path)
    return didDocLocation
  }

  async loadDidDocument ({ accountUri }) {
    const { accountStorage } = this
    const didDocLocation = new URL('/.well-known/did.json', accountUri)
    const target = new LdpTarget({ url: didDocLocation.toString() })
    const resource = await accountStorage.resource({ target })
    return JSON.parse(await accountStorage.readBlob({ resource }))
  }

  async saveKeys ({ accountUri, did, didKeys }) {
    const { accountStorage } = this
    const { exportKeys } = require('../storage/key-storage')
    const exportedKeys = await exportKeys(didKeys)
    const didFilename = escapeDidForFilename({ did })

    const keysLocation = new URL(`/vault/keys/${didFilename}.keys.json`,
      accountUri)
    const target = new LdpTarget({ url: keysLocation.toString() })
    const resource = await accountStorage.resource({ target })
    await accountStorage.writeBlob({
      resource,
      blob: JSON.stringify(exportedKeys, null, 2)
    })
  }

  async loadKeys ({ accountUri, did }) {
    const { accountStorage } = this
    const didFilename = escapeDidForFilename({ did })

    const keysLocation = new URL(`/vault/keys/${didFilename}.keys.json`,
      accountUri)
    const target = new LdpTarget({ url: keysLocation.toString() })
    const resource = await accountStorage.resource({ target })

    const keyData = JSON.parse(await accountStorage.readBlob({ resource }))
    return didKeys({ did, keyData })
  }

  /**
   * Generates salted password hash, etc.
   *
   * @param userAccount {UserAccount}
   * @param password {string}
   *
   * @return {Promise<null|Graph>}
   */
  async saveCredentialsFor ({ userAccount, password }) {
    const { storage: { users: userStore } } = this

    await userStore.createUser(userAccount, password)
    logger.info('User credentials stored')
    return userAccount
  }

  /**
   * Deletes the user's account storage space (used when deleting a user
   * accounts).
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  async deleteAccountStorage (userAccount) {
    try {
      const target = new LdpTarget({ url: userAccount.accountUri })
      const userRootContainer = await this.accountStorage.resource({ target })
      return this.accountStorage.deleteContainer({ container: userRootContainer })
    } catch (error) {
      logger.error('Error deleting account storage for:' + userAccount)
    }
  }

  /**
   * Generates an expiring one-time-use token for password reset purposes
   * (the user's Web ID is saved in the token service).
   *
   * @param userAccount {UserAccount}
   *
   * @return {string} Generated token
   */
  generateResetToken (userAccount) {
    return this.tokenService.generate('reset-password', { webId: userAccount.webId })
  }

  /**
   * Generates an expiring one-time-use token for password reset purposes
   * (the user's Web ID is saved in the token service).
   *
   * @param userAccount {UserAccount}
   *
   * @return {string} Generated token
   */
  generateDeleteToken (userAccount) {
    return this.tokenService.generate('delete-account', {
      webId: userAccount.webId,
      email: userAccount.email
    })
  }

  /**
   * Validates that a token exists and is not expired, and returns the saved
   * token contents, or throws an error if invalid.
   * Does not consume / clear the token.
   *
   * @param token {string}
   *
   * @throws {Error} If missing or invalid token
   *
   * @return {Object|false} Saved token data object if verified, false otherwise
   */
  validateDeleteToken (token) {
    const tokenValue = this.tokenService.verify('delete-account', token)

    if (!tokenValue) {
      throw new Error('Invalid or expired delete account token')
    }

    return tokenValue
  }

  /**
   * Validates that a token exists and is not expired, and returns the saved
   * token contents, or throws an error if invalid.
   * Does not consume / clear the token.
   *
   * @param token {string}
   *
   * @throws {Error} If missing or invalid token
   *
   * @return {Object|false} Saved token data object if verified, false otherwise
   */
  validateResetToken (token) {
    const tokenValue = this.tokenService.verify('reset-password', token)

    if (!tokenValue) {
      throw new Error('Invalid or expired reset token')
    }

    return tokenValue
  }

  /**
   * Returns a password reset URL (to be emailed to the user upon request)
   *
   * @param token {string} One-time-use expiring token, via the TokenService
   * @param returnToUrl {string}
   *
   * @return {string}
   */
  passwordResetUrl (token, returnToUrl) {
    let resetUrl = (new URL(`/account/password/change?token=${token}`,
      this.host.serverUri)).toString()

    if (returnToUrl) {
      resetUrl += `&returnToUrl=${returnToUrl}`
    }

    return resetUrl
  }

  /**
   * Returns a password reset URL (to be emailed to the user upon request)
   *
   * @param token {string} One-time-use expiring token, via the TokenService
   * @param returnToUrl {string}
   *
   * @return {string}
   */
  getAccountDeleteUrl (token) {
    return (new URL(`/account/delete/confirm?token=${token}`,
      this.host.serverUri)).toString()
  }

  /**
   * Returns the user's account recovery email
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<string|undefined>}
   */
  async loadAccountRecoveryEmail (userAccount) {
    const userRecord = (await this.storage.users.findUser(userAccount.id)) || {}
    return userRecord.email
  }

  verifyEmailDependencies (userAccount) {
    if (!this.emailService) {
      throw new Error('Email service is not set up')
    }

    if (!userAccount.email) {
      throw new Error('Account recovery email has not been provided')
    }
  }

  async sendDeleteAccountEmail (userAccount) {
    this.verifyEmailDependencies(userAccount)
    const resetToken = this.generateDeleteToken(userAccount)
    const deleteUrl = this.getAccountDeleteUrl(resetToken)

    const emailData = {
      to: userAccount.email,
      webId: userAccount.webId,
      deleteUrl: deleteUrl
    }

    return this.emailService.sendWithTemplate('delete-account', emailData)
  }

  async sendPasswordResetEmail (userAccount, returnToUrl) {
    this.verifyEmailDependencies(userAccount)
    const resetToken = this.generateDeleteToken(userAccount)

    const resetUrl = this.passwordResetUrl(resetToken, returnToUrl)

    const emailData = {
      to: userAccount.email,
      webId: userAccount.webId,
      resetUrl
    }

    return this.emailService.sendWithTemplate('reset-password', emailData)
  }

  /**
   * Sends a Welcome email (on new user signup).
   *
   * @param newUser {UserAccount}
   * @param newUser.email {string}
   * @param newUser.webId {string}
   * @param newUser.name {string}
   *
   * @return {Promise}
   */
  async sendWelcomeEmail (newUser) {
    const emailService = this.emailService

    if (!emailService || !newUser.email) {
      return
    }

    const emailData = {
      to: newUser.email,
      webid: newUser.webId,
      name: newUser.displayName
    }

    return emailService.sendWithTemplate('welcome', emailData)
  }
}

function isValidUsername (username) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(username)
}

module.exports = {
  AccountManager,
  isValidUsername
}
