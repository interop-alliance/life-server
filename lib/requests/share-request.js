'use strict'

const ACLChecker = require('../acl-checker')
const { URL } = require('url')
const acl = require('solid-permissions')
const { PermissionSet } = acl

class ShareRequest {
  // constructor ({ resourceUri, aclChecker, permissionSet, res }) {
  //   this.resourceUri = resourceUri
  //   this.aclChecker = aclChecker
  //   this.permissionSet = permissionSet
  //   this.res = res
  // }

  static async get (req, res) {
    const resourceUri = req.query.url

    let nearestAcl, permissionSet

    const aclChecker = ACLChecker.from({ resourceUri, req })

    try {
      nearestAcl = await aclChecker.getNearestACL()
      permissionSet = aclChecker.getPermissionSet(nearestAcl)
    } catch (error) {
      console.error(error)
      throw new Error('Cannot manage permissions: resource not found or you are not authorized')
    }

    const currentWebId = req.session.userId

    const userPermission = permissionSet.findAuthByAgent(currentWebId, resourceUri)
    if (!userPermission || !userPermission.allowsControl()) {
      throw new Error('Cannot manage permissions: resource not found or you are not authorized')
    }

    let permissions = ShareRequest.permissionsForResource(permissionSet, resourceUri)

    if (permissions.length === 0) {
      // todo: initialize new set from the inherited permissions
      permissions = ShareRequest.newPermissionSet(currentWebId, resourceUri)
      console.log(permissions)
    }

    const displayPermissions = []
    for (let p of permissions) {
      displayPermissions.push({
        user: ShareRequest.usernameFor(p),
        access: ShareRequest.accessCategory(p)
      })
    }

    res.render('viewers/permissions', { resourceUri, displayPermissions, acl: nearestAcl.acl })
  }

  static permissionsForResource (permissionSet, resourceUrl) {
    const permissions = permissionSet.allAuthorizations()

    return permissions.filter(p => p.resourceUrl === resourceUrl && !p.virtual)
  }

  static usernameFor (permission) {
    if (permission.isPublic()) {
      return { id: 'Public', icon: '/common/img/world_20x20.png' }
    }
    const accountName = new URL(permission.agent)
    return { id: accountName.hostname, icon: '/common/img/user_id_20x20.png' }
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

  static newPermissionSet (currentWebId, resourceUri) {
    const aclUri = resourceUri + '.acl'
    const isContainer = resourceUri.endsWith('/')
    const ps = new PermissionSet(resourceUri, aclUri, isContainer)

    ps.addPermission(currentWebId, [acl.READ, acl.WRITE, acl.CONTROL])

    return ShareRequest.permissionsForResource(ps, resourceUri)
  }
}

module.exports = ShareRequest
