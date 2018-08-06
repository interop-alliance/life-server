'use strict'

const LdpApi = require('../api/ldp/api')
const LegacyResourceMapper = require('../legacy-resource-mapper')
const LdpFileStore = require('../storage/ldp/ldp-file-store')

class DataViewerRequest {
  constructor ({ req, res, host, target, store, resource }) {
    this.req = req
    this.res = res
    this.host = host
    this.target = target
    this.store = store
    this.resource = resource
  }

  static async get (req, res) {
    const { host } = req.app.locals
    const ldpApi = new LdpApi({host})

    const target = ldpApi.targetFrom(req)

    const mapperOptions = {
      rootUrl: host.serverUri,
      rootPath: host.root,
      includeHost: host.multiuser
    }

    const mapper = new LegacyResourceMapper(mapperOptions)
    const storeOptions = { host, mapper }
    const store = new LdpFileStore(storeOptions)
    const resource = await store.resource(target)

    const homeRequest = new DataViewerRequest({req, res, host, target, store, resource})

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
    container.resourceNames = await this.store.loadContentsList(container)
    container.resources = await this.store.loadContentsDetails(container)

    this.res.render('viewers/container', {
      title: container.target.name,
      container,
      resources: container.resources //,
      // webId: this.req.session.userId
    })
  }

  async viewResource () {
    const contents = await this.store.readFile(this.resource)

    this.res.render('viewers/resource', {
      title: this.resource.target.name,
      contents
    })
  }
}

module.exports = {
  DataViewerRequest
}
