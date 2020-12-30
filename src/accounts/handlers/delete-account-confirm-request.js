'use strict'

const AuthRequest = require('../../authentication/handlers/auth-request')
const { logger } = require('../../logger')

class DeleteAccountConfirmRequest extends AuthRequest {
  /**
   * @param options {object}
   * @param [options.token] {string} One-time reset password token (from email)
   */
  constructor (options) {
    super(options)

    this.token = options.token
    this.validToken = false
  }

  /**
   * Factory method, returns an initialized instance of DeleteAccountConfirmRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {DeleteAccountConfirmRequest}
   */
  static fromIncoming (req, res) {
    const options = AuthRequest.baseOptions(req, res)

    options.token = this.parseParameter(req, 'token')

    return new DeleteAccountConfirmRequest(options)
  }

  /**
   * Performs a Change Password GET request.
   */
  async handleGet () {
    try {
      this.validateToken()
      this.renderForm()
    } catch (error) {
      this.error(error)
    }
  }

  /**
   * Performs the 'Change Password' operation, after the user submits the
   * password change form. Validates the parameters (the one-time token,
   * the new password), changes the password, and renders the success view.
   */
  async handlePost () {
    try {
      const tokenContents = this.validateToken()
      await this.deleteAccount(tokenContents)
      return this.renderSuccess()
    } catch (error) {
      this.error(error)
    }
  }

  /**
   * Validates the one-time Password Reset token that was emailed to the user.
   * If the token service has a valid token saved for the given key, it returns
   * the token object value (which contains the user's WebID URI, etc).
   * If no token is saved, returns `false`.
   *
   * @return {Object|false}
   */
  validateToken () {
    try {
      if (!this.token) {
        return false
      }
      const tokenContents = this.accountManager.validateDeleteToken(this.token)
      if (tokenContents) {
        this.validToken = true
      }
      return tokenContents
    } catch (error) {
      this.token = null
      throw error
    }
  }

  /**
   * Removes the user's account and all their data from the store.
   *
   * @param tokenContents {object}
   *
   * @return {Promise}
   */
  async deleteAccount (tokenContents) {
    const user = this.accountManager.userAccountFrom(tokenContents)

    logger.info('Preparing removal of account for user:' + user)

    await this.userStore.deleteUser(user)
    await this.accountManager.deleteAccountStorage(user)

    logger.warn('Removed user' + user.username)
  }

  /**
   * Renders the 'change password' form.
   *
   * @param [error] {Error} Optional error to display
   */
  renderForm (error) {
    const params = {
      validToken: this.validToken,
      token: this.token
    }

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('account/delete-confirm', params)
  }

  /**
   * Displays the 'password has been changed' success view.
   */
  renderSuccess () {
    this.response.render('account/account-deleted')
  }
}

module.exports = DeleteAccountConfirmRequest
