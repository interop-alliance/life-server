'use strict'

const AuthRequest = require('../authentication/handlers/auth-request')
const { logger } = require('../logger')
// const HttpError = require('standard-http-error')

/**
 * Represents a post-account registration step that asks the user to register
 * a CHAPI wallet with their browser.
 */
class RegisterWalletRequest extends AuthRequest {
  /**
   * Factory method, creates a request instance.
   *
   * @param req
   * @param res
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
      this.sendResponse()
    } catch (error) {
      this.error(error)
    }
  }

  /**
   * Renders the Register form
   */
  renderForm (error) {
    const { host: { features, serverUri } } = this
    const params = {
      returnToUrl: this.returnToUrl,
      serverUri: serverUri,
      loginUrl: this.loginUrl(),
      chapiMediator: features.chapiMediator
    }

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
  sendResponse () {
    const accountUrl = this.credentials.username
      ? this.accountManager.accountUriFor(this.credentials.username)
      : '/'
    const redirectUrl = this.returnToUrl || accountUrl
    logger.info('Finishing registration, redirectUrl: ' + redirectUrl)
    this.response.redirect(redirectUrl)
  }
}

module.exports = {
  RegisterWalletRequest
}
