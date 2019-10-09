const li = require('li')
const debug = require('./debug.js')
const utils = require('./utils.js')

const MODES = ['Read', 'Write', 'Append', 'Control']
const PERMISSIONS = MODES.map(m => m.toLowerCase())

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

function addLinks (res, fileMetadata) {
  if (fileMetadata.isResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#Resource', 'type')
  }
  if (fileMetadata.isSourceResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#RDFSource', 'type')
  }
  if (fileMetadata.isContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#Container', 'type')
  }
  if (fileMetadata.isBasicContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#BasicContainer', 'type')
  }
}

function parseMetadataFromHeader (linkHeader) {
  let fileMetadata = new Metadata()
  if (linkHeader === undefined) {
    return fileMetadata
  }
  const links = linkHeader.split(',')
  for (let linkIndex in links) {
    const link = links[linkIndex]
    const parsedLinks = li.parse(link)
    for (let rel in parsedLinks) {
      if (rel === 'type') {
        if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Resource') {
          fileMetadata.isResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#RDFSource') {
          fileMetadata.isSourceResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Container') {
          fileMetadata.isContainer = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#BasicContainer') {
          fileMetadata.isBasicContainer = true
          fileMetadata.isContainer = true
        }
      }
    }
  }
  return fileMetadata
}

// Adds a header that describes the user's permissions
function addPermissions (req, res, next) {
  const { acl, session } = req
  if (!acl) return next()

  // Turn permissions for the public and the user into a header
  const resource = utils.getFullUri(req)
  Promise.all([
    getPermissionsFor(acl, null, resource),
    getPermissionsFor(acl, session.userId, resource)
  ])
  .then(([publicPerms, userPerms]) => {
    debug.ACL(`Permissions on ${resource} for ${session.userId || '(none)'}: ${userPerms}`)
    debug.ACL(`Permissions on ${resource} for public: ${publicPerms}`)
    res.set('WAC-Allow', `user="${userPerms}",public="${publicPerms}"`)
  })
  .then(next, next)
}

// Gets the permissions string for the given user and resource
function getPermissionsFor (acl, user, resource) {
  return Promise.all(MODES.map(mode => acl.can(user, mode).catch(e => false)))
  .then(allowed => PERMISSIONS.filter((_, i) => allowed[i]).join(' '))
}

module.exports = {
  addPermissions,
  addLink,
  addLinks,
  parseMetadataFromHeader,
  Metadata
}
