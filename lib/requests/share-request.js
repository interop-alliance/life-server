'use strict'

const ACLChecker = require('../acl-checker')

class ShareRequest {
  static async get (req, res) {
    const resourceUri = req.query.url

    const aclChecker = ACLChecker.from({ resourceUri, req })

    const nearestAcl = await aclChecker.getNearestACL()
    const permissionSet = aclChecker.getPermissionSet(nearestAcl)

    console.log(permissionSet)
    res.render('viewers/permissions', { resourceUri })
  }
}

module.exports = ShareRequest
