'use strict'

const AuthRequest = require('../../authentication/handlers/auth-request')
const { logger } = require('../../logger')

class PasswordResetEmailRequest extends AuthRequest {
  /**
   * @param options {object}
   * @param [options.returnToUrl] {string}
   * @param [options.username] {string} Username / account name (e.g. 'alice')
   */
  constructor (options) {
    super(options)

    this.returnToUrl = options.returnToUrl
    this.username = options.username
  }

  /**
   * Factory method, returns an initialized instance of PasswordResetEmailRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {PasswordResetEmailRequest}
   */
  static fromIncoming (req, res) {
    const options = AuthRequest.baseOptions(req, res)

    options.returnToUrl = this.parseParameter(req, 'returnToUrl')
    options.username = this.parseParameter(req, 'username')

    return new PasswordResetEmailRequest(options)
  }

  /**
   * Handles a Reset Password GET request.
   */
  async handleGet () {
    try {
      this.renderForm()
    } catch (error) {
      this.error(error)
    }
  }

  /**
   * Performs a 'send me a password reset email' request operation, after the
   * user has entered an email into the reset form.
   */
  async handlePost () {
    try {
      logger.info(
        `User '${this.username}' requested to be sent a password reset email`)
      this.validate()
      const userAccount = await this.loadUser()
      await this.sendResetLink(userAccount)
      this.renderSuccess()
    } catch (error) {
      this.error(error)
    }
  }

  /**
   * Validates the request parameters, and throws an error if any
   * validation fails.
   *
   * @throws {Error}
   */
  validate () {
    if (this.accountManager.multiuser && !this.username) {
      throw new Error('Username required')
    }
  }

  /**
   * Returns a user account instance for the submitted username.
   *
   * @throws {Error} If user account does not exist for the username
   *
   * @returns {Promise<UserAccount>}
   */
  async loadUser () {
    const username = this.username

    const exists = await this.accountManager.accountExists(username)
    if (!exists) {
      throw new Error('Account not found for that username')
    }
    const userData = { username }

    return this.accountManager.userAccountFrom(userData)
  }

  /**
   * Loads the account recovery email for a given user and sends out a
   * password request email.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  async sendResetLink (userAccount) {
    const { accountManager } = this

    const recoveryEmail = await accountManager.loadAccountRecoveryEmail(userAccount)
    userAccount.email = recoveryEmail

    logger.info('Sending recovery email to:' + recoveryEmail)

    return accountManager
      .sendPasswordResetEmail(userAccount, this.returnToUrl)
  }

  /**
   * Renders the 'send password reset link' form along with the provided error.
   * Serves as an error handler for this request workflow.
   *
   * @param error {Error}
   */
  error (error) {
    const res = this.response

    logger.warn('Error sending password reset link:' + error)

    const params = {
      error: error.message,
      returnToUrl: this.returnToUrl,
      multiuser: this.accountManager.multiuser
    }

    res.status(error.statusCode || 400)

    res.render('auth/reset-password', { title: 'Reset Password', ...params })
  }

  /**
   * Renders the 'send password reset link' form
   */
  renderForm () {
    const params = {
      returnToUrl: this.returnToUrl,
      multiuser: this.accountManager.multiuser
    }

    this.response.render('auth/reset-password', {
      title: 'Reset Password',
      ...params
    })
  }

  /**
   * Displays the 'your reset link has been sent' success message view
   */
  renderSuccess () {
    this.response.render('auth/reset-link-sent', { title: 'Reset Link Sent' })
  }
}

module.exports = PasswordResetEmailRequest
