'use strict'

const DEFAULT_POST_LOGOUT_URL = '/goodbye'

class LogoutRequest {
  /**
   * @constructor
   * @param options
   * @param options.request {IncomingRequest} req
   * @param options.response {ServerResponse} res
   * @param [options.returnToUrl] {string} Post-logout url to redirect to
   */
  constructor (options) {
    this.request = options.request
    this.response = options.response
    this.returnToUrl = options.returnToUrl || DEFAULT_POST_LOGOUT_URL
  }

  static handle (req, res) {
    return Promise.resolve()
      .then(() => {
        let request = LogoutRequest.fromParams(req, res)

        return LogoutRequest.logout(request)
      })
  }

  static fromParams (req, res) {
    let options = {
      request: req,
      response: res,
      returnToUrl: LogoutRequest.parseReturnUrl(req)
    }

    return new LogoutRequest(options)
  }

  static parseReturnUrl (req) {
    let query = req.query || {}
    return query.post_logout_redirect_uri ? query.post_logout_redirect_uri : query.returnToUrl
  }

  static logout (request) {
    request.clearUserSession()
    request.redirectToGoodbye()
  }

  clearUserSession () {
    let session = this.request.session

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
