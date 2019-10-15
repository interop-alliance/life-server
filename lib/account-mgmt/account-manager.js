'use strict'

const url = require('url')
const path = require('path')
const rdf = require('rdflib')
const ns = require('solid-namespace')(rdf)

const defaults = require('../defaults')
const UserAccount = require('./user-account')
const { AccountTemplate } = require('./account-template')
const { LdpTarget } = require('../data-storage/ldp-target')
const { logger } = require('../logger')

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
   * @param [options.authMethod] {string} Primary authentication method (e.g. 'oidc')
   * @param [options.emailService] {EmailService}
   * @param [options.tokenService] {TokenService}
   * @param [options.host] {SolidHost}
   * @param [options.ldpStore] {LdpStore}
   * @param [options.pathCard] {string}
   * @param [options.suffixURI] {string}
   * @param [options.accountTemplatePath] {string} Path to the account template
   *   directory (will be used as a template for default containers, etc, when
   *   creating new accounts).
   */
  constructor (options = {}) {
    if (!options.host) {
      throw Error('AccountManager requires a host instance')
    }
    this.host = options.host
    this.emailService = options.emailService
    this.tokenService = options.tokenService
    this.authMethod = options.authMethod || defaults.auth
    this.ldpStore = options.ldpStore
    this.pathCard = options.pathCard || 'profile/card'
    this.suffixURI = options.suffixURI || '#me'
    this.accountTemplatePath = options.accountTemplatePath || './default-templates/new-account/'
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

    return this.ldpStore.exists({ target: rootAcl })
  }

  /**
   * Constructs a directory path for a given account (used for account creation).
   * Usage:
   *
   *   ```
   *   // If solid-server was launched with '/accounts/' as the root directory
   *   // and serverUri: 'https://example.com'
   *
   *   accountManager.accountDirFor('alice')  // -> '/accounts/alice.example.com'
   *   ```
   *
   * @param accountName {string}
   *
   * @return {string}
   */
  accountDirFor (accountName) {
    let accountDir

    if (this.multiuser) {
      let uri = this.accountUriFor(accountName)
      let hostname = url.parse(uri).hostname
      accountDir = path.join(this.host.root, hostname)
    } else {
      // single user mode
      accountDir = this.host.root
    }
    return accountDir
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
    let accountUri = this.multiuser
      ? this.host.accountUriFor(accountName)
      : this.host.serverUri  // single user mode

    return accountUri
  }

  /**
   * Composes a WebID (uri with hash fragment) for a given account name.
   * Usage:
   *
   *   ```
   *   // in multi user mode:
   *   acctMgr.accountWebIdFor('alice')
   *   // -> 'https://alice.example.com/profile/card#me'
   *
   *   // in single user mode:
   *   acctMgr.accountWebIdFor()
   *   // -> 'https://example.com/profile/card#me'
   *   ```
   *
   * @param [accountName] {string}
   *
   * @throws {Error} via accountUriFor()
   *
   * @return {string|null}
   */
  accountWebIdFor (accountName) {
    let accountUri = this.accountUriFor(accountName)

    let webIdUri = url.parse(url.resolve(accountUri, this.pathCard))
    webIdUri.hash = this.suffixURI
    return webIdUri.format()
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
    let accountUri = this.accountUriFor(userAccount.username)

    return url.resolve(accountUri, ACL_SUFFIX)
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
      userConfig.webId = userConfig.webId || this.accountWebIdFor(userConfig.username)
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
          .split('//')[1]  // drop the https://
      }
    } else {  // no username - derive it from web id
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

    let profileUrl = url.parse(webId)
    let hostname = profileUrl.hostname

    return hostname.split('.')[0]
  }

  /**
   * Creates user account storage (default containers etc) from a default
   * account template.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  async createAccountStorage (userAccount) {
    const template = AccountTemplate.for(userAccount)

    const templatePath = this.accountTemplatePath
    const accountDir = this.accountDirFor(userAccount.username)

    logger.info(`Creating account folder for ${userAccount.webId} at ${accountDir}`)

    await AccountTemplate.copyTemplateDir(templatePath, accountDir)

    return template.processAccount(accountDir)
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
    let tokenValue = this.tokenService.verify('delete-account', token)

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
    let resetUrl = url.resolve(this.host.serverUri,
      `/account/password/change?token=${token}`)

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
    return url.resolve(this.host.serverUri, `/account/delete/confirm?token=${token}`)
  }

  /**
   * Parses and returns an account recovery email stored in a user's root .acl
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<string|undefined>}
   */
  async loadAccountRecoveryEmail (userAccount) {
    const rootAclUrl = this.rootAclFor(userAccount)
    const target = new LdpTarget({ url: rootAclUrl })
    const resource = this.ldpStore.resource({ target })

    const rootAclGraph = await this.ldpStore.loadParsedGraph({ resource })

    let matches = rootAclGraph.match(null, ns.acl('agent'))

    let recoveryMailto = matches.find(agent => {
      return agent.object.value.startsWith('mailto:')
    })

    if (recoveryMailto) {
      recoveryMailto = recoveryMailto.object.value.replace('mailto:', '')
    }

    return recoveryMailto
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

