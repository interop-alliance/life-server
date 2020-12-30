'use strict'

const { ApiRequest } = require('../../api-request')
const { logger } = require('../../logger')

const DEFAULT_POST_LOGOUT_URL = '/goodbye'

class LogoutRequest extends ApiRequest {
  /**
   * @param options
   * @param options.request {IncomingRequest} req
   * @param options.response {ServerResponse} res
   * @param [options.returnToUrl] {string} Post-logout url to redirect to
   */
  constructor (options) {
    super(options)
    this.returnToUrl = options.returnToUrl || DEFAULT_POST_LOGOUT_URL
  }

  static fromIncoming (req, res) {
    const options = ApiRequest.baseOptions(req, res)
    options.returnToUrl = LogoutRequest.parseReturnUrl(req)

    return new LogoutRequest(options)
  }

  static parseReturnUrl (req) {
    const query = req.query || {}
    return query.post_logout_redirect_uri ? query.post_logout_redirect_uri : query.returnToUrl
  }

  async handleGet (req, res) {
    logger.warn('Logging out...')
    this.clearUserSession()
    this.redirectToGoodbye()
  }

  clearUserSession () {
    const { session } = this

    session.accessToken = ''
    session.refreshToken = ''
    session.userId = ''
    session.subject = ''
  }

  redirectToGoodbye () {
    this.response.redirect(this.returnToUrl)
  }
}

module.exports = LogoutRequest
