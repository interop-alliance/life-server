'use strict'

const { LdpGetRequest } = require('../api/ldp/ldp-request')

class DataViewerRequest extends LdpGetRequest {
  /**
   * @param options {object} See constructor of LdpGetRequest and LdpRequest.
   *
   * @returns {DataViewerRequest}
   */
  static async from (options) {
    return new DataViewerRequest(options)
  }

  async perform ({ response }) {
    if (this.resource.isContainer) {
      await this.viewContainer({ response })
    } else {
      await this.viewResource({ response })
    }

    return {
      status: 200,
      contentType: this.target.contentTypeRequested()
    }
  }

  async viewContainer ({ response }) {
    const container = this.resource
    container.resourceNames = await this.ldpStore.loadContentsList({ container })
    container.resources = await this.ldpStore.loadContentsDetails({ container })

    response.render('viewers/container', {
      title: container.target.name,
      container,
      resources: container.resources,
      webId: this.credentials.webId
    })
  }

  async viewResource ({ response }) {
    const contents = await this.ldpStore.readBlob({ resource: this.resource })

    response.render('viewers/resource', {
      title: this.resource.target.name,
      contents
    })
  }

  writeResponse () {
    // FIXME - move render logic into here
    // Do nothing - response is already rendered in view*() methods above
  }
}

module.exports = {
  DataViewerRequest
}
