'use strict'

const { getNearestACL, getPermissionSet } = require('./ldp-wac')
const { URL } = require('url')
const acl = require('@interop/solid-permissions')
const { PermissionSet, Permission, SingleAgent } = acl
const { LdpTarget } = require('../storage/ldp-target')
const rdf = require('rdflib')
const { logger } = require('../logger')

class ShareRequest {
  constructor ({ host, resourceUrl, target, currentWebId, permissionSet, nearestAcl, body, ldpStore, res }) {
    this.host = host
    this.resourceUrl = resourceUrl
    this.target = target
    this.currentWebId = currentWebId
    this.permissionSet = permissionSet
    this.nearestAcl = nearestAcl
    this.body = body
    this.res = res
    this.ldpStore = ldpStore
  }

  static async get (req, res) {
    const { host, storage } = req.app.locals
    const currentWebId = req.session.userId

    const resourceUrl = req.query.url // resource to be shared

    const target = new LdpTarget({ url: resourceUrl })
    const ldpStore = storage.storeForTarget({ target })
    const resource = await ldpStore.resource({ target })
    const { permissionSet, nearestAcl } = await ShareRequest.getAcl(resource, currentWebId, ldpStore)

    const request = new ShareRequest({
      host, resourceUrl, target, currentWebId, permissionSet, nearestAcl, res
    })

    return request.handleGet()
  }

  static async post (req, res) {
    const { host, storage } = req.app.locals
    const currentWebId = req.session.userId

    const resourceUrl = req.body.url // resource to be shared
    const target = new LdpTarget({ url: resourceUrl })
    const ldpStore = storage.storeForTarget({ target })
    const resource = await ldpStore.resource({ target })
    const { permissionSet, nearestAcl } = await ShareRequest.getAcl(resource, currentWebId, ldpStore)

    const request = new ShareRequest({
      host, resourceUrl, target, currentWebId, permissionSet, nearestAcl, body: req.body, ldpStore, res
    })

    return request.handlePost()
  }

  /**
   * @param resource {LdpResource}
   * @param currentWebId {string}
   * @param ldpStore {LdpStore}
   * @returns {Promise<{permissionSet: PermissionSet, nearestAcl: {acl: string, graph: IndexedFormula, isContainer: boolean}}>}
   */
  static async getAcl (resource, currentWebId, ldpStore) {
    let nearestAcl, permissionSet

    try {
      nearestAcl = await getNearestACL({ resource, ldpStore })
      const { aclUrl, graph, isContainer } = nearestAcl
      permissionSet = getPermissionSet({
        target: resource.target, aclUrl, graph, isContainer
      })
    } catch (error) {
      console.error(error)
      throw new Error('Cannot manage permissions: resource not found or you are not authorized')
    }

    if (ShareRequest.permissionsFor(permissionSet, resource.target.url).length === 0) {
      // todo: initialize new set from the inherited permissions
      permissionSet = ShareRequest.defaultPermissionSet(resource, currentWebId)
    }

    return { permissionSet, nearestAcl }
  }

  static permissionsFor (permissionSet, resourceUrl) {
    return permissionSet
      .allPermissions()
      .filter(p => p.resourceUrl === resourceUrl && !p.virtual && p.accessType === 'accessTo')
  }

  async handleGet () {
    this.validateCurrentUser()

    this.render(this.displayPermissions(this.permissions()))
  }

  async handlePost () {
    this.validateCurrentUser()

    await this.applyOperation()

    this.render(this.displayPermissions(this.permissions()))
  }

  async applyOperation () {
    switch (this.body.operation) {
      case 'add':
        return this.applyAddOperation()
      case 'remove':
        return this.applyRemoveOperation()
      default:
        // do nothing
    }
  }

  async applyAddOperation () {
    const { target, ldpStore } = this
    const modesByCategory = {
      manage: [acl.READ, acl.WRITE, acl.CONTROL],
      edit: [acl.READ, acl.WRITE],
      view: [acl.READ]
    }

    const agentId = this.normalizeWebId(this.body.webId)
    if (!agentId) {
      throw new Error('Cannot add permission, invalid Web ID:', agentId)
    }

    const modes = modesByCategory[this.body.category]
    if (!modes) {
      throw new Error('Cannot add permission, invalid category: ' + this.body.category)
    }

    this.permissionSet.addMode({ agentId, accessMode: modes })

    if (target.isContainer) {
      // also add an 'accessTo' permission
      this.permissionSet.addMode({ agentId, accessMode: modes, inherit: false })
    }

    const aclTarget = new LdpTarget({ url: target.aclUrl })
    const aclResource = await ldpStore.resource({ target: aclTarget })
    const graph = this.permissionSet.buildGraph(rdf)

    return ldpStore.writeGraph({ resource: aclResource, graph })
  }

  async applyRemoveOperation () {
    const { target, ldpStore } = this
    const webId = this.body.permissionId

    const permission = new Permission({
      resourceUrl: this.resourceUrl,
      agent: new SingleAgent({ webId })
    })
    this.permissionSet.removePermission(permission)

    if (target.isContainer) {
      const accessTo = new Permission({
        resourceUrl: this.resourceUrl,
        inherit: false,
        agent: new SingleAgent({ webId })
      })
      this.permissionSet.removePermission(accessTo)
    }

    const aclTarget = new LdpTarget({ url: target.aclUrl })
    const aclResource = await ldpStore.resource({ target: aclTarget })
    const graph = this.permissionSet.buildGraph(rdf)
    return ldpStore.writeGraph({ resource: aclResource, graph })
  }

  normalizeWebId (webId) {
    if (!webId.startsWith('http')) {
      webId = 'https://' + webId
    }
    return webId
  }

  displayPermissions (permissions) {
    return permissions.map(p => {
      return {
        user: ShareRequest.displayUser(p, this.currentWebId),
        access: ShareRequest.accessCategory(p)
      }
    })
  }

  validateCurrentUser () {
    const userPermission = this.permissionSet.permissionByAgent(
      this.currentWebId, this.resourceUrl
    )

    if (!userPermission || !userPermission.allowsControl()) {
      throw new Error('Cannot manage permissions: resource not found or you are not authorized')
    }
  }

  permissions () {
    return ShareRequest.permissionsFor(this.permissionSet, this.resourceUrl)
  }

  /**
   * @param resource {LdpResource}
   * @param currentWebId {string}
   * @returns {PermissionSet}
   */
  static defaultPermissionSet (resource, currentWebId) {
    const { target } = resource
    const ps = new PermissionSet(target.url, target.aclUrl, resource.isContainer)

    ps.addMode({
      agentId: currentWebId, accessMode: [acl.READ, acl.WRITE, acl.CONTROL]
    })

    return ps
  }

  render (displayPermissions) {
    this.res.render('viewers/permissions',
      { resourceUrl: this.resourceUrl, displayPermissions, acl: this.nearestAcl.aclUrl })
  }

  static displayUser (permission, currentWebId) {
    if (permission.isPublic) {
      return { id: 'Public', icon: '/common/img/world_20x20.png' }
    }

    let accountName

    try {
      accountName = new URL(permission.agent.id)
    } catch (error) {
      logger.error(error)
    }

    if (!accountName) {
      return null
    }

    return {
      id: accountName.hostname,
      webId: permission.agent.id,
      icon: '/common/img/user_id_20x20.png',
      isCurrentUser: permission.agent.id === currentWebId
    }
  }

  /**
   * @param permission
   *
   * @returns {string|null}
   */
  static accessCategory (permission) {
    if (permission.allowsControl()) {
      return 'Manage'
    }

    if (permission.allowsWrite()) {
      return 'Edit'
    }

    if (permission.allowsAppend()) {
      return 'Append'
    }

    if (permission.allowsRead()) {
      return 'View'
    }

    return null
  }
}

module.exports = ShareRequest
