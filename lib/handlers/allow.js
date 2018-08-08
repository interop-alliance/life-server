module.exports = allow

const ACL = require('../acl-checker')
const utils = require('../utils')
const debug = require('../debug.js').ACL

function allow (mode) {
  return function allowHandler (req, res, next) {
    const { mapper } = req.app.locals
    const ldp = req.app.locals.ldp || {}
    const host = req.app.locals.host || {}

    if (!host.webid) {
      return next()
    }

    // Set up URL to filesystem mapping
    const rootUrl = utils.getBaseUri(req)

    // Determine the actual path of the request
    let reqPath = res && res.locals && res.locals.path
      ? res.locals.path
      : req.path

    // Check whether the resource exists
    ldp.exists(req.hostname, reqPath, (err, ret) => {
      // Ensure directories always end in a slash
      const stat = err ? null : ret.stream
      if (!reqPath.endsWith('/') && stat && stat.isDirectory()) {
        reqPath += '/'
      }

      // Obtain and store the ACL of the requested resource
      req.acl = ACL.from(rootUrl, reqPath, req)

      // Ensure the user has the required permission
      const userId = req.session.userId
      req.acl.can(userId, mode)
        .then(() => next(), err => {
          debug(`${mode} access denied to ${userId || '(none)'}`)
          next(err)
        })
    })
  }
}
