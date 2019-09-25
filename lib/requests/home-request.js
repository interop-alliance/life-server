'use strict'

const { targetFrom } = require('../api/ldp/api')

class HomeRequest {
  constructor ({ req, res, host, target, ldpStore }) {
    this.req = req
    this.res = res
    this.host = host
    this.target = target
    this.ldpStore = ldpStore
  }

  static async handle (req, res) {
    const { host, storage: { store: ldpStore } } = req.app.locals

    const target = targetFrom({ req, host })

    const homeRequest = new HomeRequest({ req, res, host, target, ldpStore })

    // Render the User Account Home/Dashboard view
    return homeRequest.userHomePage()
  }

  async userHomePage () {
    const container = await this.ldpStore.resource({ target: this.target })
    container.resourceNames = await this.ldpStore.loadContentsList({ container })
    container.resources = await this.ldpStore.loadContentsDetails({ container })

    this.res.render('account/home', {
      title: 'Dashboard',
      container,
      resources: container.resources,
      // FIXME: Switch this to use `credentials` object
      webId: this.req.session.userId
    })
  }
}

module.exports = {
  HomeRequest
}
