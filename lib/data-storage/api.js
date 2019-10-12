'use strict'

const { LdpRequest, LdpPatchRequest } = require('./ldp-request')
const { HomeRequest } = require('../ui/home-request')
const { DataViewerRequest } = require('../ui/data-viewer-request')
const wac = require('../authorization/ldp-wac')
const HttpError = require('standard-http-error')
const crypto = require('crypto')
const debug = require('debug')('solid:ldp')
const { parseMetadataFromHeader, Metadata } = require('../header')

function requestHandler () {
  /**
   * Provides an Express handler for LDP API requests.
   * Authentication has already happened earlier in the middleware stack, stored
   * in session.
   *
   * @see https://github.com/solid/solid-architecture/blob/master/server/request-flow.md
   *
   * @throws {Error} 401 If request not authenticated but resource is non-public
   *
   * @throws {Error} 404 If resource is not found, OR if found and request
   *   is not authorized to access it (default behavior, can be overridden by
   *   owner of resource)
   *
   * @throws {Error} 403 If request is not authorized to access resource and
   *   user has enabled "Request permission" action
   *
   * @throws {Error} 400 If invalid parameters (or error parsing request body,
   *   for cases like PATCH requests)
   *
   * @throws {Error} 409 If PATCH request results in conflict
   *
   * @throws {Error} 406 If no appropriate representation found (for content type)
   *
   * @throws {Error} 405 If HTTP method not allowed / not implemented
   */
  return async function handleRequest (req, res, next) {
    try {
      const { host, storage } = req.app.locals
      const session = req.session || {}
      const credentials = { webId: session.userId }

      const target = LdpRequest.target({ req, host })

      const ldpStore = storage.storeForTarget({ target })
      const resource = await ldpStore.resource({ target })

      // console.log('REQUESTED:', target.contentTypeRequested())
      // console.log('CONTENT-TYPE:', resource.contentType)

      const request = await requestFrom({
        req, target, resource, host, ldpStore, credentials
      })

      const requiredPermissions = request.requiredPermissions

      let permissions

      if (requiredPermissions) {
        permissions = await wac.allow({
          resource, requiredPermissions, ldpStore, credentials
        })
      }

      // perform the request and return a result
      let result
      try {
        result = await request.perform({ response: res })
      } catch (error) {
        console.log('ERROR in request.perform():', error)
        throw error
      }

      // write both generic and op-specific headers
      // note: you need `permissions` for the WAC-Allow header
      request.writeHeaders({ res, result, permissions })

      request.writeResponse({ res, result })
    } catch (error) {
      next(error)
    }
  }
}

/**
 * LdpRequest factory method
 *
 * @param req {IncomingRequest} Express req
 * @param target {LdpTarget}
 * @param resource {LdpResource}
 * @param host {SolidHost}
 * @param ldpStore {LdpStore}
 * @param credentials {object}
 *
 * @returns {Promise<LdpRequest>}
 */
async function requestFrom ({ req, target, resource, host, ldpStore, credentials }) {
  const { headers } = req
  const { link } = headers
  const { bodyContentType } = target
  const bodyStream = req // TODO: create a lazy parser here?
  const method = req.method.toLowerCase()

  let headerMeta
  if (['patch', 'post', 'put'].includes(method)) {
    headerMeta = parseMetadataFromHeader(link)
  } else { // GET, HEAD, DELETE, OPTIONS, COPY
    headerMeta = new Metadata()
    if (resource.isContainer) {
      headerMeta.isContainer = true
      headerMeta.isBasicContainer = true
    }
    if (resource.isRdf) {
      headerMeta.isSourceResource = true
    }
  }

  const options = {
    method, target, resource, headers, bodyStream, credentials, ldpStore, host, headerMeta
  }

  if (method === 'patch') {
    const patch = {}
    patch.text = req.body ? req.body.toString() : ''
    patch.uri = `${target.url}#patch-${hash(patch.text)}`
    patch.contentType = (req.get('content-type') || '').match(/^[^;\s]*/)[0]
    const patchObject = await LdpPatchRequest.parsePatchObject({ target, patch })
    patch.parsed = patchObject
    options.patch = patch
  }

  // Handle SPARQL(-update?) query
  if (method === 'post' &&
      bodyContentType === 'application/sparql' ||
      bodyContentType === 'application/sparql-update') {
    debug('switching to sparql query')
    return LdpPatchRequest.from(options)
  }

  // Handle special case / override
  if (target.htmlRequested && target.isRoot) {
    const singleUserHomeRequest = host.isSingleUser
    const multiUserHomeRequest = host.isMultiUser &&
      !(target.url.startsWith(host.serverUri))

    if (singleUserHomeRequest || multiUserHomeRequest) {
      return HomeRequest.from(options)
    }
  }

  // Check to see if it's a request for a data viewer
  if (target.htmlRequested && resource.isRdf) {
    return DataViewerRequest.from(options)
  }

  const Request = LdpRequest.BY_METHOD[options.method.toLowerCase()]
  if (!Request) {
    throw new HttpError(405, 'Method not supported')
  }

  return Request.from(options)
}

/**
 * Creates a hash of the given text. (This is not required to be crypto-secure,
 * it's just for a convenient url fragment.)
 * @param text
 * @returns {string}
 */
function hash (text) {
  return crypto.createHash('md5').update(text).digest('hex')
}

module.exports = {
  requestHandler,
  requestFrom
}
