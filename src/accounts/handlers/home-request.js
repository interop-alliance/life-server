'use strict'

const { LdpGetRequest } = require('../../storage/ldp-request')

class HomeRequest extends LdpGetRequest {
  /**
   * @param options {object} See constructor of LdpGetRequest and LdpRequest.
   *
   * @returns {HomeRequest}
   */
  static async from (options) {
    return new HomeRequest(options)
  }

  async perform ({ response }) {
    const container = await this.ldpStore.resource({ target: this.target })
    container.resourceNames = await this.ldpStore.loadContentsList({ container })
    container.resources = await this.ldpStore.loadContentsDetails({ container })
    const { webId } = this.credentials

    response.render('account/home', {
      title: 'Dashboard',
      container,
      resources: container.resources,
      webId
    })

    return {
      status: 200,
      contentType: this.target.contentTypeRequested()
    }
  }

  writeResponse () {
    // FIXME - move render logic into here
    // Do nothing - response is already rendered in perform()
  }
}

module.exports = {
  HomeRequest
}
