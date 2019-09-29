'use strict'

const { PermissionSet } = require('solid-permissions')
const rdf = require('rdflib')
const ACL = rdf.Namespace('http://www.w3.org/ns/auth/acl#')
const debug = require('./debug').ACL
const { DEFAULT_ACL_SUFFIX } = require('./constants')
const HttpError = require('standard-http-error')

/**
 * Tests whether the permissions allow a given operation
 * @param resource {LdpResource}
 * @param requiredPermissions {Set<string>}
 * @param ldpStore {LdpStore}
 * @param credentials {object}
 *
 * @throws {Error}
 *
 * @returns {Promise<PermissionSet>} Returns the permissions that the current user
 *   (and public) has on the resource
 */
async function allow ({ resource, requiredPermissions, ldpStore, credentials }) {
  // Check if Auth is disabled, bail early if so
  if (!ldpStore.host.webid) {
    return null
  }

  // TODO: Pass in credentials, once getNearestACL supports remote acls
  const { aclUrl, graph, isContainer } = await getNearestACL({ resource, ldpStore })
  const permissions = getPermissionSet({
    target: resource.target, aclUrl, graph, isContainer
  })

  const user = credentials.webId
  const [ mode ] = Array.from(requiredPermissions)

  console.log('Required Permissions:', mode)

  const options = { fetchGraph: url => ldpStore.fetchGraph({ url }) }

  const hasAccess = await permissions.checkAccess(
    resource.target.url, user, mode, options
  )
  if (hasAccess) {
    return permissions
  } else {
    throw new Error('ACL file found but no matching policy found')
  }
}

/**
 * Gets the ACL that applies to the resource
 * @param resource {LdpResource} Resource uri
 * @param requests {object} Requests cache
 * @param fetch {function} fetch(uri) -> graph, (fetch from local fs or remote)
 *
 * @returns {Promise<{aclUri: string, graph: IndexedFormula, isContainer: boolean}>}
 */
async function getNearestACL ({ resource, ldpStore, requests = {} }) {
  const url = resource.target.url
  let isContainer = false
  const possibleACLs = getPossibleACLs({ url })
  const acls = [...possibleACLs]
  let returnAcl = null
  while (possibleACLs.length > 0 && !returnAcl) {
    const aclUrl = possibleACLs.shift()
    let graph
    try {
      requests[aclUrl] = requests[aclUrl] || ldpStore.fetchGraph({ url: aclUrl })
      graph = await requests[aclUrl]
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.status === 404)) {
        isContainer = true
        continue
      }
      debug(err)
      throw err
    }
    const relative = url.replace(aclUrl.replace(/[^/]+$/, ''), './')
    debug(`Using ACL ${aclUrl} for ${relative}`)
    returnAcl = { aclUri: aclUrl, graph, isContainer }
  }
  if (!returnAcl) {
    throw new HttpError(500, `No ACL found for ${url}, searched in \n- ${acls.join('\n- ')}`)
  }
  const groupNodes = returnAcl.graph.statementsMatching(null, ACL('agentGroup'), null)
  const groupUrls = groupNodes.map(node => node.object.value.split('#')[0])
  await Promise.all(groupUrls.map(groupUrl => {
    requests[groupUrl] = requests[groupUrl] ||
      ldpStore.fetchGraph({ url: groupUrl, graph: returnAcl.graph })
    return requests[groupUrl]
  }))

  return returnAcl
}

/**
 * Gets all possible ACL paths that apply to the resource
 * @param url {string}
 * @param suffix {string}
 *
 * @returns {Array<string>}
 */
function getPossibleACLs ({ url, suffix = DEFAULT_ACL_SUFFIX }) {
  // Obtain the resource URI and the length of its base
  const [{ length: base }] = url.match(/^[^:]+:\/*[^/]+/)

  // If the URI points to a file, append the file's ACL
  const possibleAcls = []
  if (!url.endsWith('/')) {
    possibleAcls.push(url.endsWith(suffix) ? url : url + suffix)
  }

  // Append the ACLs of all parent directories
  for (let i = lastSlash(url); i >= base; i = lastSlash(url, i - 1)) {
    possibleAcls.push(url.substr(0, i + 1) + suffix)
  }
  return possibleAcls
}

// Returns the index of the last slash before the given position
function lastSlash (string, pos = string.length) {
  return string.lastIndexOf('/', pos)
}

// Gets the permission set for the given ACL
function getPermissionSet ({ target, aclUrl, graph, isContainer }) {
  if (!graph || graph.length === 0) {
    debug('ACL ' + aclUrl + ' is empty')
    throw new Error('No policy found - empty ACL')
  }
  const aclOptions = {
    aclSuffix: DEFAULT_ACL_SUFFIX,
    graph: graph,
    rdf: rdf,
    strictOrigin: false,
    isAcl: url => isAcl(url),
    aclUrlFor: url => aclUrlFor(url)
  }
  return new PermissionSet(target.url, aclUrl, isContainer, aclOptions)
}

function aclUrlFor (url) {
  return isAcl(url) ? url : url + DEFAULT_ACL_SUFFIX
}

function isAcl (url) {
  return url.endsWith(DEFAULT_ACL_SUFFIX)
}

module.exports = {
  allow
}
