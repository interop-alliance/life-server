'use strict'

const AuthRequest = require('../authentication/auth-request')
const { logger } = require('../logger')

class DeleteAccountConfirmRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   * @param options.accountManager {AccountManager}
   * @param options.userStore {UserCredentialStore}
   * @param options.response {ServerResponse} express response object
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
  static fromParams (req, res) {
    const locals = req.app.locals
    const accountManager = locals.accountManager
    const storage = locals.storage

    const token = this.parseParameter(req, 'token')

    const options = {
      accountManager,
      storage,
      token,
      response: res
    }

    return new DeleteAccountConfirmRequest(options)
  }

  /**
   * Handles a Change Password GET request on behalf of a middleware handler.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {Promise}
   */
  static async get (req, res) {
    const request = DeleteAccountConfirmRequest.fromParams(req, res)

    try {
      request.validateToken()
      return request.renderForm()
    } catch (error) {
      return request.error(error)
    }
  }

  /**
   * Handles a Change Password POST request on behalf of a middleware handler.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {Promise}
   */
  static async post (req, res) {
    const request = DeleteAccountConfirmRequest.fromParams(req, res)

    return DeleteAccountConfirmRequest.handlePost(request)
  }

  /**
   * Performs the 'Change Password' operation, after the user submits the
   * password change form. Validates the parameters (the one-time token,
   * the new password), changes the password, and renders the success view.
   *
   * @param request {DeleteAccountConfirmRequest}
   *
   * @return {Promise}
   */
  static async handlePost (request) {
    try {
      const tokenContents = request.validateToken()
      await request.deleteAccount(tokenContents)
      return request.renderSuccess()
    } catch (error) {
      return request.error(error)
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
   * @param tokenContents {Object}
   *
   * @return {Promise}
   */
  async deleteAccount (tokenContents) {
    const user = this.accountManager.userAccountFrom(tokenContents)

    logger.info('Preparing removal of account for user:', user)

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
