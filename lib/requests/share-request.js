'use strict'

const { getNearestACL, getPermissionSet } = require('../ldp-wac')
const { URL } = require('url')
const acl = require('solid-permissions')
const { PermissionSet } = acl
const { LdpRequest } = require('../api/ldp/ldp-request')
const { LdpTarget } = require('../api/ldp/ldp-target')
const rdf = require('rdflib')

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

    const target = LdpRequest.target({ req, host })
    const resourceUrl = target.url
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

    const target = LdpRequest.target({ req, host })
    const resourceUrl = target.url
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

    if (ShareRequest.permissionsFor(permissionSet, resource.url).length === 0) {
      // todo: initialize new set from the inherited permissions
      permissionSet = ShareRequest.defaultPermissionSet(resource, currentWebId)
      // console.log(permissions)
    }

    return { permissionSet, nearestAcl }
  }

  static permissionsFor (permissionSet, resourceUrl) {
    return permissionSet
      .allAuthorizations()
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
    console.log('Applying operation:', this.body)

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
      'manage': [ acl.READ, acl.WRITE, acl.CONTROL ],
      'edit': [ acl.READ, acl.WRITE ],
      'view': [ acl.READ ]
    }

    const webId = this.normalizeWebId(this.body.webId)
    if (!webId) {
      throw new Error('Cannot add permission, invalid Web ID:', webId)
    }

    const modes = modesByCategory[this.body.category]
    if (!modes) {
      throw new Error('Cannot add permission, invalid category: ' + this.body.category)
    }

    console.log('Adding modes:', modes, 'to:', webId)

    this.permissionSet.addPermission(webId, modes)

    const aclTarget = LdpTarget({ url: target.aclUrl })
    const aclResource = ldpStore.resource({ target: aclTarget })
    const graph = this.permissionSet.buildGraph(rdf)
    return ldpStore.writeGraph({ resource: aclResource, graph })
  }

  async applyRemoveOperation () {
    const { target, ldpStore } = this
    const webId = this.body.permissionId
    console.log('Removing permission for webid:', webId)

    const permission = this.permissionSet.permissionFor(webId, this.resourceUrl)
    this.permissionSet.removeAuthorization(permission)

    const aclTarget = LdpTarget({ url: target.aclUrl })
    const aclResource = ldpStore.resource({ target: aclTarget })
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
    const userPermission = this.permissionSet.findAuthByAgent(
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

    ps.addPermission(currentWebId, [acl.READ, acl.WRITE, acl.CONTROL])

    return ps
  }

  render (displayPermissions) {
    this.res.render('viewers/permissions',
      { resourceUrl: this.resourceUrl, displayPermissions, acl: this.nearestAcl.aclUrl })
  }

  static displayUser (permission, currentWebId) {
    if (permission.isPublic()) {
      return { id: 'Public', icon: '/common/img/world_20x20.png' }
    }

    let accountName

    try {
      accountName = new URL(permission.agent)
    } catch (error) {
    }

    if (!accountName) {
      return null
    }

    return {
      id: accountName.hostname,
      webId: permission.agent,
      icon: '/common/img/user_id_20x20.png',
      isCurrentUser: permission.agent === currentWebId
    }
  }

  /**
   * @todo: Support Append semantics
   * @param permission
   *
   * @returns {string|null}
   */
  static accessCategory (permission) {
    let modes = Object.keys(permission.accessModes).map(m => m.toLowerCase())
    modes = new Set(modes)

    if (modes.has('http://www.w3.org/ns/auth/acl#control')) {
      return 'Manage'
    }

    if (modes.has('http://www.w3.org/ns/auth/acl#write')) {
      return 'Edit'
    }

    if (modes.has('http://www.w3.org/ns/auth/acl#read')) {
      return 'View'
    }

    return null
  }
}

module.exports = ShareRequest
