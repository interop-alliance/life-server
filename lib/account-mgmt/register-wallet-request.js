'use strict'

const AuthRequest = require('../authentication/auth-request')
const { logger } = require('../logger')
// const HttpError = require('standard-http-error')

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

    return new RegisterWalletRequest(options)
  }

  async handleGet () {
    try {
      this.renderForm()
    } catch (error) {
      this.error(error)
    }
  }

  async handlePost () {
    try {
      this.sendResponse(this.userAccount)
    } catch (error) {
      this.error(error)
    }
  }

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
   * Sends response to user (directs the user to the next step of registration).
   */
  sendResponse (userAccount = {}) {
    const redirectUrl = this.returnToUrl ||
      this.accountManager.accountUriFor(userAccount.username)
    logger.info('Finishing registration, redirectUrl:', redirectUrl)
    this.response.redirect(redirectUrl)
  }
}

module.exports = {
  RegisterWalletRequest
}
