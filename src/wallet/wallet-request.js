'use strict'

const AuthRequest = require('../authentication/handlers/auth-request')
const { logger } = require('../logger')
// const HttpError = require('standard-http-error')

class WalletRequest extends AuthRequest {
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

    // const body = req.body || {}

    return new WalletRequest(options)
  }

  static getWorker () {
    /**
     * @param req {IncomingRequest}
     * @param res {ServerResponse}
     * @param next {Function}
     */
    return async (req, res, next) => {
      try {
        const request = this.fromIncoming(req, res)
        await request.handleWorker()
      } catch (error) {
        logger.error('Error in WalletRequest:' + error)
        next(error)
      }
    }
  }

  async handleWorker () {
    try {
      this.renderForm(null, {
        view: 'account/wallet-worker',
        title: 'Worker'
      })
    } catch (error) {
      this.error(error)
    }
  }

  static getOperationUi () {
    /**
     * @param req {IncomingRequest}
     * @param res {ServerResponse}
     * @param next {Function}
     */
    return async (req, res, next) => {
      try {
        console.log('In WalletRequest.getOperationUi:')
        const request = this.fromIncoming(req, res)
        await request.handleGetOperation()
      } catch (error) {
        logger.error('Error in WalletRequest:' + error)
        next(error)
      }
    }
  }

  async handleGetOperation () {
    try {
      const { credentials: { webId } } = this

      if (webId) {
        this.renderForm(null, { view: 'account/wallet-get-ui', title: 'Wallet' })
      } else {
        const returnToUrl = '/api/wallet/get'
        const session = this.session || {}
        session.returnToUrl = returnToUrl
        const params = {
          registerUrl: this.registerUrl(),
          returnToUrl
        }

        logger.info('Rendering in-wallet Login, params: ' +
          JSON.stringify(params))

        this.response.render('auth/login',
          { title: 'Login', layout: 'material', ...params })
      }
    } catch (error) {
      this.error(error)
    }
  }

  static storeOperationUi () {
    /**
     * @param req {IncomingRequest}
     * @param res {ServerResponse}
     * @param next {Function}
     */
    return async (req, res, next) => {
      try {
        const request = this.fromIncoming(req, res)
        await request.handleStoreOperation()
      } catch (error) {
        logger.error('Error in WalletRequest:' + error)
        next(error)
      }
    }
  }

  async handleStoreOperation () {
    try {
      this.renderForm(null, { view: 'account/wallet-store-ui', title: 'Wallet' })
    } catch (error) {
      this.error(error)
    }
  }

  /**
   * Renders the Register form
   */
  renderForm (error, { view, title } = {}) {
    const { serverUri, features } = this.host
    const params = {
      returnToUrl: this.returnToUrl,
      serverUri,
      chapiMediator: features.chapiMediator
    }

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render(view, { title, layout: 'wallet', ...params })
  }

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
  WalletRequest
}
