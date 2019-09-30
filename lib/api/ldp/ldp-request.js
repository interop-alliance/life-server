'use strict'

const url = require('url')
const acl = require('solid-permissions')
const HttpError = require('standard-http-error')
const LdpTarget = require('./ldp-target')

class LdpRequest {
  /**
   * @param target {LdpTarget}
   * @param resource {LdpResource}
   * @param headers {object}
   * @param [bodyStream] {Stream} Request body stream, for parsing when
   *   needed
   * @param ldpStore {LdpStore}
   * @param [credentials=null] {object} Credentials object,
   *   contains WebID string, as well as any bearer credentials/tokens. Needed
   *   for authenticated fetch (of remote group ACLs, of Copy resources, etc).
   *   Null if request is not authenticated.
   * @param requiredPermissions {Set}
   */
  constructor ({ target, resource, headers, bodyStream, ldpStore,
                 credentials = null }) {
    this.target = target
    this.resource = resource
    this.headers = headers
    this.bodyStream = bodyStream
    this.ldpStore = ldpStore
    // this.body = body ?
    this.credentials = credentials
  }

  /**
   * General construction method, overridden where needed (such as in
   * LdpGetRequest).
   *
   * @async (to match LdpGetRequest.from() which needs to access store)
   *
   * @param options {object} See constructor
   *
   * @returns {LdpRequest}
   */
  static async from (options) {
    const Request = this
    return new Request(options)
  }

  /**
   * @returns {Set|null} Set of permissions required to perform this request.
   *   null in case of Options requests (no permissions required).
   */
  get requiredPermissions () {
    throw new Error('requiredPermissions must be implemented in subclass')
  }

  writeHeaders ({res, result, permissions}) {
    this.writeCommonHeaders({res, result, permissions})
  }

  /**
   * @param res {object} Express response object
   * @param result {object} Result of ldpRequest.perform()
   */
  writeCommonHeaders ({res, result = {}, permissions}) {
    const { resource } = this

    // res.set('X-Powered-By', 'Life Server/' + version)
    // res.set('Vary', 'Accept, Authorization, Origin')
    // // Set default Allow methods
    // res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')

    console.log('HEAD media type:', resource.mediaType)

    // set headers in common to all LDP responses
    if (resource) { // delete request don't return a result, for example
      res.set('Content-Type', resource.mediaType)
      res.set('Content-Length', resource.contentLength)
    }
  }
}

/**
 * Checks to see if target exists
 */
class LdpHeadRequest extends LdpRequest {
  /**
   * @param options {RequestOptions}
   * @returns {LdpHeadRequest}
   */
  static async from (options) {
    const { ldpStore, target } = options

    if (target.isContainer) {
      // if it is a container, check to see if index.html exists
      const indexFileUrl = url.resolve(target.url, '/index.html')
      const indexFile = new LdpTarget({ url: indexFileUrl, conneg: target.conneg })

      if (await ldpStore.exists({ target: indexFile }) && target.mediaType() === 'text/html') {
        // This is a browser and an index file exists, return it
        return new LdpHeadRequest({target: indexFile, ...options})
      }
    }

    // plain head request
    return new LdpHeadRequest(options)
  }

  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.READ ])
  }

  /**
   * Performs HTTP HEAD request.
   *
   * @throws {HttpError} 404 if resource does not exist
   *
   * @returns {Promise}
   */
  async perform () {
    const { resource } = this

    if (!resource.exists) {
      throw new HttpError(404)
    }
  }
// res.setHeader('Content-Type', contentType)
  /**
   * @param res {ServerResponse}
   */
  writeResponse ({res}) {
    // res.sendStatus(200, 'OK')
    res.status(200).send('OK')
  }
}

/**
 * Use cases to handle:
 *  - "List Container" request, if target is an ldp container
 *  - However, if Accept: header is HTML, check if index.html exists
 *  - Need to also support similar use case if index.ttl exists
 *  - HTTP Range request (partial bytes of a resource)
 *  - Otherwise, plain Get request
 */
class LdpGetRequest extends LdpRequest {
  /**
   * @param options {RequestOptions}
   * @returns {LdpGetRequest|LdpListContainerRequest|LdpRangeRequest}
   */
  static async from (options) {
    const { ldpStore, target, headers } = options

    if (headers.range) {
      return new LdpRangeRequest(options)
    }

    if (target.isContainer) {
      // if it is a container, check to see if index.html exists
      const indexFileUrl = url.resolve(target.url, '/index.html')
      const indexFile = new LdpTarget({ url: indexFileUrl, conneg: target.conneg })

      if (await ldpStore.exists({ target: indexFile }) && target.mediaType() === 'text/html') {
        // This is a browser and an index file exists, return it
        return new LdpGetRequest({target: indexFile, ...options})
      }

      return new LdpListContainerRequest(options)
    }

    // plain get request
    return new LdpGetRequest(options)
  }

  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.READ ])
  }
}

class LdpRangeRequest extends LdpGetRequest {}

class LdpListContainerRequest extends LdpGetRequest {}

/**
 * Creates a resource or container, and any necessary containers above it in
 * the hierarchy. Idempotent.
 *
 * If target is a container:
 *   - creates the container if none existed
 *   - does nothing if container exists, does not delete/clear existing contents
 *   - has `mkdir -p` semantics (creates missing container hierarchy)
 *
 * If target is a resource:
 *   - writes the resource, always overwriting existing contents if any existed
 *     (since we currently don't support conditional `If-None-Match` requests)
 *   - has `mkdir -p` semantics (creates intermediate container hierarchy)
 */
class LdpPutRequest extends LdpRequest {
  // TODO: Handle Append use case
  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.WRITE ])
  }

  /**
   * @param ldpStore {LdpMultiStore}
   * @returns {Promise<object>} Ldp request result
   */
  async perform ({ ldpStore }) {
    const resource = await ldpStore.resource({ target: this.target })

    return resource.isContainer
      ? this.putContainer({ldpStore, container: resource})
      : this.putResource({ldpStore, resource})
  }

  async putResource ({ldpStore, resource}) {
    try {
      await ldpStore.createResource(resource, this.bodyStream)
    } catch (error) {
      // log error here
      throw error
    }
    return { status: 201, statusText: 'Created', resource }
  }

  async putContainer ({ldpStore, container}) {
    if (container.exists) {
      // no further action needed
      return { status: 204, statusText: 'No content', resource: container }
    }
    try {
      await ldpStore.createContainer(container)
    } catch (error) {
      // log error here
      throw error
    }
    return { status: 201, statusText: 'Created', resource: container }
  }

  writeHeaders ({res, result, permissions}) {
    this.writeCommonHeaders({res, result, permissions})

    const { resource } = result

    res.set('Location', resource.target.url)
  }

  writeResponse ({res, result}) {
    res.status(result.status).send(result.statusText)
  }
}

/**
 * Creates a new resource or container in the target container. The name of
 * this new resource is derived as follows:
 *
 *  - Use contents of `Slug` header, if provided and no resource with same
 *    name already exists
 *  - Use contents of Slug plus UUID, if resource with same name exists
 *  - Generate a UUID if no Slug given
 *
 * Does NOT use `mkdir -p` semantics (does not create missing containers)
 *
 * Throws:
 *  - 400 error if target doesn't end in a / (is not a container)
 *  - 404 error if target container does not exist
 */
class LdpPostRequest extends LdpRequest {
  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.APPEND ])
  }
}

/**
 * Performs an LDP Patch request. Like put, creates missing intermediate
 * containers in the path hierarchy.
 *
 * Throws:
 *  - 400 error if malformed patch syntax
 *  - 409 Conflict error if trying to DELETE triples that do not exist
 */
class LdpPatchRequest extends LdpRequest {
  get requiredPermissions () {
    // TODO: Handle WRITE vs APPEND, based on patch contents
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.WRITE ])
  }
}

class LdpDeleteRequest extends LdpRequest {
  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.WRITE ])
  }

  /**
   * Deletes resource or container
   *
   * Throws:
   * - 404 error if resource or container does not exist
   * - 409 Conflict error if deleting a non-empty container
   *
   * @returns {Promise}
   */
  async perform () {
    const { resource, ldpStore } = this

    if (!resource.exists) {
      throw new HttpError(404)
    }

    if (resource.isContainer) {
      const container = resource
      container.resourceNames = await ldpStore.loadContentsList({ container })

      if (!ldpStore.isContainerEmpty(container)) {
        throw new HttpError(409, 'Container is not empty')
      }

      return ldpStore.deleteContainer({ container })
    }

    return ldpStore.deleteResource({ resource })
  }

  writeResponse ({res}) {
    // successfully deleted
    res.sendStatus(200, 'OK')
  }
}

/**
 * Handles HTTP COPY requests to import a given resource (specified in
 * the `Source:` header) to a destination (specified in request path).
 * For the moment, you can copy from public resources only (no auth
 * delegation is implemented), and is mainly intended for use with
 * "Save an external resource to Solid" type apps.
 *
 * Open questions:
 * - What to do if destination resource exists. (Currently overwrites it)
 * - Whether or not to create missing intermediate containers (like PUT
 *   does) - currently does not do this (behaves like POST)
 * - Future: Use an authenticated fetch (pass along the requester's
 *   bearer credentials, for example) so that they can COPY from
 *   private resources.
 *
 * Throws:
 * - 400 'Source header required' error if Source: header is missing
 * - 404 if source resource is not found
 */
class LdpCopyRequest extends LdpRequest {
  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.WRITE ])
  }
}

/**
 * Useful for server config discovery etc.
 * Note: Does not throw 404 errors. The semantics of OPTIONS are
 * "If this resource existed, here are the headers and properties
 *  it would have"
 */
class LdpOptionsRequest extends LdpRequest {
  get requiredPermissions () {
    return null
  }
}

const BY_METHOD = {
  'head': LdpHeadRequest,
  'get': LdpGetRequest,
  'put': LdpPutRequest,
  'post': LdpPostRequest,
  'patch': LdpPatchRequest,
  'delete': LdpDeleteRequest,
  'copy': LdpCopyRequest,
  'options': LdpOptionsRequest
}

LdpRequest.BY_METHOD = BY_METHOD

module.exports = {
  LdpRequest
}
