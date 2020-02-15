'use strict'

const { PermissionSet } = require('@interop/solid-permissions')
const rdf = require('rdflib')
const ACL = rdf.Namespace('http://www.w3.org/ns/auth/acl#')
const { logger } = require('../logger')
const { ACL_SUFFIX } = require('../defaults')
const HttpError = require('standard-http-error')

/**
 * Tests whether the permissions allow a given operation
 * @param resource {LdpResource}
 * @param requiredPermissions {Set<string>}
 * @param ldpStore {LdpStore}
 * @param credentials {object}
 *
 * @throws {HttpError} 401 If request is not authenticated, but resource is non-public
 * @throws {HttpError} 403 If user has no access to resource (and it's non-public)
 *
 * @returns {Promise<PermissionSet>} Returns the permissions that the current user
 *   (and public) has on the resource
 */
async function allow ({ resource, requiredPermissions, ldpStore, credentials }) {
  // Check if Auth is disabled, bail early if so
  if (!ldpStore.host.webid) {
    return null
  }

  let permissions
  const webId = credentials.webId

  try {
    // TODO: Pass in credentials, once getNearestACL supports remote acls
    const { aclUrl, graph, isContainer } = await getNearestACL({ resource, ldpStore })
    permissions = getPermissionSet({
      target: resource.target, aclUrl, graph, isContainer
    })

    const modes = Array.from(requiredPermissions)

    const options = { fetchGraph: url => ldpStore.fetchGraph({ url }) }

    const accessForMode = await Promise.all(
      modes.map(mode => permissions.checkAccess(
        resource.target.url, webId, mode, options
      ))
    )

    const hasAccess = accessForMode.every(access => access)

    if (hasAccess) {
      return permissions
    } else {
      throw new Error('ACL file found but no matching policy found')
    }
  } catch (error) {
    logger.info('Error in allow():', error)
    if (!webId) {
      throw new HttpError(401, `Access to ${resource.target.url} requires authorization`)
    } else {
      throw new HttpError(403, `Access to ${resource.target.url} denied for ${webId}`)
    }
  }
}

/**
 * Gets the ACL that applies to the resource
 * @param resource {LdpResource} Resource uri
 * @param ldpStore {LdpStore}
 * @param requests {object} Requests cache
 *
 * TODO: Add:
 * @param fetch {function} fetch(uri) -> graph, (fetch from local fs or remote)
 *
 * @returns {Promise<{aclUrl: string, graph: IndexedFormula, isContainer: boolean}>}
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
      logger.info(err)
      throw err
    }
    const relative = url.replace(aclUrl.replace(/[^/]+$/, ''), './')
    logger.info(`Using ACL ${aclUrl} for ${relative}`)
    returnAcl = { aclUrl, graph, isContainer }
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
function getPossibleACLs ({ url, suffix = ACL_SUFFIX }) {
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

/**
 * Gets the permission set for the given ACL
 * @param target {LdpTarget}
 * @param aclUrl {string}
 * @param graph {IndexedFormula}
 * @param isContainer {boolean}
 *
 * @returns {PermissionSet}
 */
function getPermissionSet ({ target, aclUrl, graph, isContainer }) {
  if (!graph || graph.length === 0) {
    logger.info('ACL ' + aclUrl + ' is empty')
    throw new Error('No policy found - empty ACL')
  }

  return PermissionSet.fromGraph({ target, aclUrl, isContainer, graph, rdf })
}

module.exports = {
  allow,
  getNearestACL,
  getPossibleACLs,
  getPermissionSet
}
