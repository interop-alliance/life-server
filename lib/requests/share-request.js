'use strict'

const ACLChecker = require('../acl-checker')
const { URL } = require('url')
const acl = require('solid-permissions')
const { PermissionSet } = acl
const rdf = require('rdflib')

class ShareRequest {
  constructor ({ host, resourceUrl, currentWebId, permissionSet, nearestAcl, body, ldp, res }) {
    this.host = host
    this.resourceUrl = resourceUrl
    this.currentWebId = currentWebId
    this.permissionSet = permissionSet
    this.nearestAcl = nearestAcl
    this.body = body
    this.ldp = ldp
    this.res = res
  }

  static async get (req, res) {
    const { host } = req.app.locals
    const resourceUrl = req.query.url
    const currentWebId = req.session.userId
    const { permissionSet, nearestAcl } = await ShareRequest.getAcl(resourceUrl, currentWebId, req)

    const request = new ShareRequest({
      host, resourceUrl, currentWebId, permissionSet, nearestAcl, res
    })

    return request.handleGet()
  }

  static async post (req, res) {
    const { host, ldp } = req.app.locals
    const resourceUrl = req.body.url
    const currentWebId = req.session.userId
    const { permissionSet, nearestAcl } = await ShareRequest.getAcl(resourceUrl, currentWebId, req)

    const request = new ShareRequest({
      host, resourceUrl, currentWebId, permissionSet, nearestAcl, body: req.body, ldp, res
    })

    return request.handlePost()
  }

  static async getAcl (resourceUri, currentWebId, req) {
    let nearestAcl, permissionSet

    const aclChecker = ACLChecker.from({ resourceUri, req })

    try {
      nearestAcl = await aclChecker.getNearestACL()
      permissionSet = aclChecker.getPermissionSet(nearestAcl)
    } catch (error) {
      console.error(error)
      throw new Error('Cannot manage permissions: resource not found or you are not authorized')
    }

    if (ShareRequest.permissionsFor(permissionSet, resourceUri).length === 0) {
      // todo: initialize new set from the inherited permissions
      permissionSet = ShareRequest.defaultPermissionSet(resourceUri, currentWebId)
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

    const aclUrl = this.resourceUrl + '.acl'
    return this.ldp.putGraph(this.permissionSet.buildGraph(rdf), aclUrl)
  }

  applyRemoveOperation () {
    const webId = this.body.permissionId
    console.log('Removing permission for webid:', webId)

    const permission = this.permissionSet.permissionFor(webId, this.resourceUrl)
    this.permissionSet.removeAuthorization(permission)

    const aclUrl = this.resourceUrl + '.acl'
    return this.ldp.putGraph(this.permissionSet.buildGraph(rdf), aclUrl)
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

  static defaultPermissionSet (resourceUrl, currentWebId) {
    const aclUri = resourceUrl + '.acl'
    const isContainer = resourceUrl.endsWith('/')
    const ps = new PermissionSet(resourceUrl, aclUri, isContainer)

    ps.addPermission(currentWebId, [acl.READ, acl.WRITE, acl.CONTROL])

    return ps
  }

  render (displayPermissions) {
    this.res.render('viewers/permissions',
      { resourceUrl: this.resourceUrl, displayPermissions, acl: this.nearestAcl.acl })
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
