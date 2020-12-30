'use strict'

const { LdpGetRequest } = require('../storage/ldp-request')

class ServerWelcomeRequest extends LdpGetRequest {
  /**
   * @param options {object} See constructor of LdpGetRequest and LdpRequest.
   *
   * @returns {ServerWelcomeRequest}
   */
  static async from (options) {
    return new ServerWelcomeRequest(options)
  }

  get requiredPermissions () {
    return null
  }

  async perform ({ response }) {
    // const container = await this.ldpStore.resource({ target: this.target })
    // container.resourceNames = await this.ldpStore.loadContentsList({ container })
    // container.resources = await this.ldpStore.loadContentsDetails({ container })
    // const { webId } = this.credentials
    return {
      status: 200,
      contentType: this.target.contentTypeRequested()
    }
  }

  writeResponse ({ res }) {
    res.render('viewers/server-welcome', {
      title: 'Welcome!'
    })
  }
}

module.exports = {
  ServerWelcomeRequest
}
