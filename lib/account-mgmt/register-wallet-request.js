'use strict'

const AuthRequest = require('../authentication/auth-request')
const { logger } = require('../logger')
const HttpError = require('standard-http-error')

/**
 * Represents a post-account registration step that asks the user to register
 * a CHAPI wallet with their browser.
 */
class RegisterWalletRequest extends AuthRequest {
  /**
   * @param [options={}] {Object}
   * @param [options.accountManager] {AccountManager}
   * @param [options.userAccount] {UserAccount}
   * @param [options.session] {Session} e.g. req.session
   * @param [options.response] {ServerResponse}
   * @param [options.returnToUrl] {string} If present, redirect the agent to
   *   this url on successful account creation
   */
  constructor (options) {
    super(options)

    this.userAccount = options.userAccount
  }

  /**
   * Factory method, creates a  CreateAccontRequest instance.
   *
   * @param req
   * @param res
   *
   * @throws {Error} If required parameters are missing (via
   *   `userAccountFrom()`), or it encounters an unsupported authentication
   *   scheme.
   *
   * @return {RegisterWalletRequest}
   */
  static fromIncoming (req, res) {
    const options = AuthRequest.baseOptions(req, res)

    // const body = req.body || {}

    return new RegisterWalletRequest(options)

    // if (authMethod === 'oidc') {
    //   options.password = body.password
    //   return new CreateOidcAccountRequest(options)
    // } else {
    //   throw new TypeError('Unsupported authentication scheme')
    // }
  }

  async handleGet () {
    try {
      this.renderForm()
    } catch (error) {
      this.error(error)
    }
  }

  // async handlePost () {
  //   try {
  //     this.validate()
  //     await this.createAccount()
  //   } catch (error) {
  //     this.error(error)
  //   }
  // }

  /**
   * Renders the Register form
   */
  renderForm (error) {
    const params = Object.assign({}, this.authQueryParams,
      {
        returnToUrl: this.returnToUrl,
        serverUri: this.host.serverUri,
        loginUrl: this.loginUrl()
      })

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('account/register-wallet',
      { title: 'Register Wallet', layout: 'wallet', ...params })
  }

  /**
   * Creates an account for a given user (from a POST to `/api/accounts/new`)
   *
   * @throws {Error} An http 400 error if an account already exists
   *
   * @return {Promise<UserAccount>} Resolves with newly created account instance
   */
  // async createAccount () {
  //   const { userAccount, accountManager } = this
  //
  //   this.cancelIfUsernameInvalid(userAccount)
  //   await this.cancelIfAccountExists(userAccount)
  //   await this.createAccountStorage(userAccount)
  //   await this.saveCredentialsFor(userAccount)
  //   await this.initUserSession(userAccount)
  //   this.sendResponse(userAccount)
  //
  //   if (userAccount && userAccount.email) {
  //     logger.info('Sending Welcome email')
  //     // This is an async function but 'await' not used deliberately -
  //     // no need to block and wait for email to be sent
  //     accountManager.sendWelcomeEmail(userAccount)
  //   }
  //   return userAccount
  // }

  /**
   * Throws an error if an account already exists
   *
   * @return {Promise<UserAccount>} Chainable
   */
  // async cancelIfAccountExists (userAccount) {
  //   const exists = await this.accountManager.accountExists(userAccount.username)
  //
  //   if (exists) {
  //     logger.info(`Canceling account creation, ${userAccount.webId} already exists`)
  //     throw new HttpError(400, 'Account already exists')
  //   }
  //
  //   return userAccount
  // }

  /**
   * Validates the Login request (makes sure required parameters are present),
   * and throws an error if not.
   *
   * @throws {Error} If missing required params
   */
  // validate () {
  //   if (!this.username) {
  //     throw new HttpError(400, 'Display name required.')
  //   }
  //
  //   if (!this.password) {
  //     throw new HttpError(400, 'Password required.')
  //   }
  // }

  /**
   * Sends response to user (directs the user to the next step of registration).
   *
   * @param userAccount {UserAccount}
   */
  // sendResponse (userAccount) {
  //   const redirectUrl = this.returnToUrl ||
  //     this.accountManager.accountUriFor(userAccount.username)
  //   this.response.redirect(redirectUrl)
  // }
}

module.exports = {
  RegisterWalletRequest
}
