const li = require('li')

class Metadata {
  constructor () {
    this.isResource = true
    this.isSourceResource = false
    this.isContainer = false
    this.isBasicContainer = false
  }
}

function addLink (res, value, rel) {
  const oldLink = res.get('Link')
  if (oldLink === undefined) {
    res.set('Link', '<' + value + '>; rel="' + rel + '"')
  } else {
    res.set('Link', oldLink + ', ' + '<' + value + '>; rel="' + rel + '"')
  }
}

function addLinks (res, resource) {
  if (resource.isResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#Resource', 'type')
  }
  if (resource.isSourceResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#RDFSource', 'type')
  }
  if (resource.isContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#Container', 'type')
  }
  if (resource.isBasicContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#BasicContainer', 'type')
  }
}

function parseMetadataFromHeader (linkHeader) {
  const resourceMeta = new Metadata()
  if (linkHeader === undefined) {
    return resourceMeta
  }
  const links = linkHeader.split(',')
  for (const linkIndex in links) {
    const link = links[linkIndex]
    const parsedLinks = li.parse(link)
    for (const rel in parsedLinks) {
      if (rel === 'type') {
        if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Resource') {
          resourceMeta.isResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#RDFSource') {
          resourceMeta.isSourceResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Container') {
          resourceMeta.isContainer = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#BasicContainer') {
          resourceMeta.isBasicContainer = true
          resourceMeta.isContainer = true
        }
      }
    }
  }
  return resourceMeta
}

// const MODES = ['Read', 'Write', 'Append', 'Control']
// const PERMISSIONS = MODES.map(m => m.toLowerCase())

// Adds a header that describes the user's permissions
// function addPermissions (req, res, next) {
//   const { acl, session } = req
//   if (!acl) return next()
//
//   // Turn permissions for the public and the user into a header
//   const resource = utils.getFullUri(req)
//   Promise.all([
//     getPermissionsFor(acl, null, resource),
//     getPermissionsFor(acl, session.userId, resource)
//   ])
//   .then(([publicPerms, userPerms]) => {
//     debug.ACL(`Permissions on ${resource} for ${session.userId || '(none)'}: ${userPerms}`)
//     debug.ACL(`Permissions on ${resource} for public: ${publicPerms}`)
//     res.set('WAC-Allow', `user="${userPerms}",public="${publicPerms}"`)
//   })
//   .then(next, next)
// }

// Gets the permissions string for the given user and resource
// function getPermissionsFor (acl, user, resource) {
//   return Promise.all(MODES.map(mode => acl.can(user, mode).catch(e => false)))
//   .then(allowed => PERMISSIONS.filter((_, i) => allowed[i]).join(' '))
// }

module.exports = {
  // addPermissions,
  addLink,
  addLinks,
  parseMetadataFromHeader,
  Metadata
}
