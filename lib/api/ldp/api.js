'use strict'

const { LdpRequest } = require('./ldp-request')
const { HomeRequest } = require('../../requests/home-request')
const { DataViewerRequest } = require('../../requests/data-viewer-request')
const LdpTarget = require('./ldp-target')
const wac = require('../../ldp-wac')
const HttpError = require('standard-http-error')
const Negotiator = require('negotiator')

/**
 * Usage:
 *   ```
 *   const mapperOptions = {
 *     rootUrl: host.serverUri,
 *     rootPath: host.root,
 *     includeHost: host.multiuser
 *   }
 *   const mapper = new LegacyResourceMapper(mapperOptions)
 *
 *   const storeOptions = {
 *     host, mapper, suffixMeta, suffixAcl
 *   }
 *   const store = new LdpFileStore(storeOptions)
 *
 *   const handleLdpRequest = requestHandler({host, store})
 *   ```
 *
 * @param store {LdpFileStore|LdpMemoryStore|LdpQuadStore} storage backend
 *   (either file system based, or in-memory, or SPARQL based quad store, etc)
 *
 * @param host {SolidHost} Server config object
 */
function requestHandler ({host, store}) {
  /**
   * Provides an Express handler for LDP API requests.
   * Authentication has already happened earlier in the middleware stack, stored
   * in session.
   * Usage:
   *   ```
   *   app.use('/', ldp.handleRequest)
   *   ```
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

      const target = targetFrom({ req, host })

      const ldpStore = storage.storeForTarget({ target })
      const resource = await ldpStore.resource({ target })

      // console.log('REQUESTED:', target.contentTypeRequested())
      // console.log('CONTENT-TYPE:', resource.contentType)

      const request = await requestFrom({
        req, target, resource, host, ldpStore, credentials
      })

      const requiredPermissions = request.requiredPermissions

      const permissions = await wac.allow({
        resource, requiredPermissions, ldpStore, credentials
      })

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
 * @param req {IncomingRequest}
 *
 * @returns {Promise<LdpRequest>}
 */
async function requestFrom ({ req, target, resource, host, ldpStore, credentials }) {
  const options = RequestOptions.from({
    req, target, resource, host, ldpStore, credentials
  })

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

class RequestOptions {
  /**
   * @param method {string} Http method
   * @param target {LdpTarget}
   * @param resource {LdpResource|LdpContainer}
   * @param headers {object}
   * @param bodyStream {ReadableStream} (currently using `req` for this)
   * @param credentials {object} From session.authentication obj
   * @param ldpStore {LdpStore}
   */
  constructor ({ method, target, resource, headers, bodyStream, credentials, ldpStore }) {
    this.method = method.toUpperCase()
    this.target = target
    this.resource = resource
    this.headers = headers
    this.bodyStream = bodyStream
    this.credentials = credentials
    this.ldpStore = ldpStore
  }

  /**
   * @param req {IncomingRequest} Express req
   * @param host {SolidHost}
   * @param target {LdpTarget}
   * @param resource {LdpResource|LdpContainer}
   * @param ldpStore {LdpStore}
   *
   * @returns {RequestOptions}
   */
  static from ({ req, target, resource, host, ldpStore, credentials }) {
    const { method, headers } = req

    const bodyStream = req // TODO: create a lazy parser here

    return new RequestOptions({
      method, target, resource, headers, bodyStream, credentials, ldpStore
    })
  }
}

function targetFrom ({ req, host }) {
  return new LdpTarget(parseTarget({ req, host }))
}

function parseTarget ({ req, host }) {
  const targetUrl = host.parseTargetUrl(req)
  const conneg = new Negotiator(req)

  return { name: req.path, url: targetUrl, conneg }
}

module.exports = {
  requestHandler,
  requestFrom,
  parseTarget,
  targetFrom
}
