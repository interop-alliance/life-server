'use strict'

const LdpApi = require('../api/ldp/api')
const LegacyResourceMapper = require('../legacy-resource-mapper')
const LdpFileStore = require('../storage/ldp/ldp-file-store')

class HomeRequest {
  constructor ({ req, res, host, target, store }) {
    this.req = req
    this.res = res
    this.host = host
    this.target = target
    this.store = store
  }

  static async handle (req, res) {
    const { host } = req.app.locals
    const ldpApi = new LdpApi({host})

    const target = ldpApi.targetFrom(req)

    const mapperOptions = {
      rootUrl: host.serverUri,
      rootPath: host.root,
      includeHost: host.multiuser
    }

    const mapper = new LegacyResourceMapper(mapperOptions)
    const storeOptions = {
      host, mapper //, suffixMeta, suffixAcl
    }
    const store = new LdpFileStore(storeOptions)

    const homeRequest = new HomeRequest({req, res, host, target, store})

    // Render the User Account Home/Dashboard view
    return homeRequest.userHomePage()
  }

  async userHomePage () {
    const container = await this.store.resource(this.target)
    container.resourceNames = await this.store.loadContentsList(container)
    container.resources = await this.store.loadContentsDetails(container)

    this.res.render('account/home', {
      title: 'Dashboard',
      container,
      resources: container.resources,
      webId: this.req.session.userId
    })
  }
}

module.exports = {
  HomeRequest
}
