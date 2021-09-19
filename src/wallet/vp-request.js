'use strict'

const { ApiRequest } = require('../server/api-request')
const { logger } = require('../util/logger')

class VpRequest extends ApiRequest {
  /**
   * static post () - implemented in ApiClass, calls handlePost()
   */

  async handlePost () {
    try {
      const { credentials: { webId } } = this

      const { domain, challenge, accountManager } = this
      // const { serverUri, features } = this.host

      if (!webId) {
        return this.errorJson(new Error('Authentication required.'), { statusCode: 401 })
      }

      if (webId) {
        this.renderForm(null, { view: 'wallet/wallet-get-ui', title: 'Wallet' })
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
      this.errorJson(error)
    }
  }
}

module.exports = {
  VpRequest
}
