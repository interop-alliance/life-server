'use strict'

const AuthRequest = require('../authentication/auth-request')
const { logger } = require('../logger')

class PasswordChangeRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   * @param options.accountManager {AccountManager}
   * @param options.userStore {UserCredentialStore}
   * @param options.response {ServerResponse} express response object
   * @param [options.token] {string} One-time reset password token (from email)
   * @param [options.returnToUrl] {string}
   * @param [options.newPassword] {string} New password to save
   */
  constructor (options) {
    super(options)

    this.token = options.token
    this.returnToUrl = options.returnToUrl

    this.validToken = false

    this.newPassword = options.newPassword
  }

  /**
   * Factory method, returns an initialized instance of PasswordChangeRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {PasswordChangeRequest}
   */
  static fromParams (req, res) {
    const locals = req.app.locals
    const accountManager = locals.accountManager

    const returnToUrl = this.parseParameter(req, 'returnToUrl')
    const token = this.parseParameter(req, 'token')
    const oldPassword = this.parseParameter(req, 'password')
    const newPassword = this.parseParameter(req, 'newPassword')

    const options = {
      accountManager,
      storage: locals.storage,
      returnToUrl,
      token,
      oldPassword,
      newPassword,
      response: res
    }

    return new PasswordChangeRequest(options)
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
    const request = PasswordChangeRequest.fromParams(req, res)
    try {
      request.validateToken()
      request.renderForm()
    } catch (error) {
      request.error(error)
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
  static post (req, res) {
    const request = PasswordChangeRequest.fromParams(req, res)

    return PasswordChangeRequest.handlePost(request)
  }

  /**
   * Performs the 'Change Password' operation, after the user submits the
   * password change form. Validates the parameters (the one-time token,
   * the new password), changes the password, and renders the success view.
   *
   * @param request {PasswordChangeRequest}
   *
   * @return {Promise}
   */
  static async handlePost (request) {
    try {
      request.validatePost()
      const tokenContents = request.validateToken()
      await request.changePassword(tokenContents)
      request.renderSuccess()
    } catch (error) {
      request.error(error)
    }
  }

  /**
   * Validates the 'Change Password' parameters, and throws an error if any
   * validation fails.
   *
   * @throws {Error}
   */
  validatePost () {
    if (!this.newPassword) {
      throw new Error('Please enter a new password')
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
    if (!this.token) { return false }

    let validToken
    try {
      validToken = this.accountManager.validateResetToken(this.token)
      this.validToken = !!validToken
    } catch (error) {
      this.token = null
      throw error
    }

    return validToken
  }

  /**
   * Changes the password that's saved in the user store.
   * If the user has no user store entry, it creates one.
   *
   * @param tokenContents {Object}
   * @param tokenContents.webId {string}
   *
   * @return {Promise}
   */
  async changePassword (tokenContents) {
    const user = this.accountManager.userAccountFrom(tokenContents)

    logger.info('Changing password for user:', user.webId)

    const userStoreEntry = await this.userStore.findUser(user.id)

    if (userStoreEntry) {
      return this.userStore.updatePassword(user, this.newPassword)
    } else {
      return this.userStore.createUser(user, this.newPassword)
    }
  }

  /**
   * Renders the 'change password' form.
   *
   * @param [error] {Error} Optional error to display
   */
  renderForm (error) {
    const params = {
      validToken: this.validToken,
      returnToUrl: this.returnToUrl,
      token: this.token
    }

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('auth/change-password', {
      title: 'Change Password', ...params
    })
  }

  /**
   * Displays the 'password has been changed' success view.
   */
  renderSuccess () {
    this.response.render('auth/password-changed', {
      title: 'Password Changed', returnToUrl: this.returnToUrl
    })
  }
}

module.exports = PasswordChangeRequest
