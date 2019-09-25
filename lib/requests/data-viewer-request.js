'use strict'

const { targetFrom } = require('../api/ldp/api')

class DataViewerRequest {
  /**
   * @param req
   * @param res
   * @param host
   * @param target {LdpTarget}
   * @param ldpStore {LdpMultiStore}
   * @param resource
   */
  constructor ({ req, res, host, target, ldpStore, resource }) {
    this.req = req
    this.res = res
    // this.host = host
    // this.target = target
    this.ldpStore = ldpStore
    this.resource = resource
  }

  static async get (req, res) {
    const { host, storage: { store: ldpStore } } = req.app.locals

    const target = targetFrom({ req, host })

    const resource = await ldpStore.resource({ target })

    const homeRequest = new DataViewerRequest({
      req, res, host, target, ldpStore, resource
    })

    return homeRequest.view()
  }

  async view () {
    if (this.resource.isContainer) {
      return this.viewContainer()
    } else {
      return this.viewResource()
    }
  }

  async viewContainer () {
    const container = this.resource
    container.resourceNames = await this.ldpStore.loadContentsList({ container })
    container.resources = await this.ldpStore.loadContentsDetails({ container })

    this.res.render('viewers/container', {
      title: container.target.name,
      container,
      resources: container.resources
      // webId: this.req.session.userId
    })
  }

  async viewResource () {
    const contents = await this.ldpStore.readBlob({ resource: this.resource })

    this.res.render('viewers/resource', {
      title: this.resource.target.name,
      contents
    })
  }
}

module.exports = {
  DataViewerRequest
}
