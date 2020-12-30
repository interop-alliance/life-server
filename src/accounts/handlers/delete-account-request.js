'use strict'

const AuthRequest = require('../../authentication/handlers/auth-request')
const { logger } = require('../../logger')

class DeleteAccountRequest extends AuthRequest {
  constructor (options) {
    super(options)

    this.username = options.username
  }

  /**
   * Factory method, returns an initialized instance of DeleteAccountRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {DeleteAccountConfirmRequest}
   */
  static fromIncoming (req, res) {
    const options = AuthRequest.baseOptions(req, res)

    options.username = this.parseParameter(req, 'username')

    return new DeleteAccountRequest(options)
  }

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
        `User '${this.username}' requested to be sent a delete account email`)

      this.validate()
      const userAccount = await this.loadUser()
      await this.sendDeleteLink(userAccount)
      return this.renderSuccess()
    } catch (error) {
      this.error(error)
    }
  }

  /**
   * Returns a user account instance for the submitted username.
   *
   * @throws {Error} Rejects if user account does not exist for the username
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
   * Renders the Delete form
   */
  renderForm (error) {
    this.response.render('account/delete', {
      error,
      multiuser: this.accountManager.multiuser
    })
  }

  /**
   * Displays the 'your reset link has been sent' success message view
   */
  renderSuccess () {
    this.response.render('account/delete-link-sent')
  }

  /**
   * Loads the account recovery email for a given user and sends out a
   * password request email.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  async sendDeleteLink (userAccount) {
    const accountManager = this.accountManager

    const recoveryEmail = await accountManager.loadAccountRecoveryEmail(userAccount)
    userAccount.email = recoveryEmail

    logger.info('Preparing delete account email to:' + recoveryEmail)

    return accountManager.sendDeleteAccountEmail(userAccount)
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
}

module.exports = DeleteAccountRequest
