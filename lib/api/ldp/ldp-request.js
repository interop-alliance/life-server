'use strict'

const url = require('url')
const Busboy = require('busboy')
const acl = require('solid-permissions')
const HttpError = require('standard-http-error')
const LdpTarget = require('./ldp-target')
const { promisify } = require('util')
const serialize = promisify(require('rdflib').serialize)
const translate = promisify(require('../../utils').translate)
const { parseMetadataFromHeader, addLinks, addLink, Metadata } = require('../../header')
const debug = require('debug')('solid:ldp')
const { DEFAULT_RDF_TYPE } = require('../../constants')

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
   * @param host {SolidHost}
   */
  constructor ({ target, resource, headers, bodyStream, ldpStore, credentials = null, host }) {
    this.target = target
    this.resource = resource
    this.headers = headers
    this.bodyStream = bodyStream
    this.ldpStore = ldpStore
    // this.body = body ?
    this.credentials = credentials
    this.host = host
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
   * Translates from the contentType found to the requested rdf type desired
   *
   * @param stream {ReadStream}
   * @param target {LdpTarget}
   * @param resource {LdpFileResource}
   *
   * @throws {HttpError} 400 Error translating between RDF formats
   *
   * @returns {Promise<{responseBody, resource: *, contentType: *, status: number}>}
   */
  static async translateStream ({ stream, target, resource }) {
    try {
      // translate (stream, baseUri, from, to)
      // TODO: translate() is buffering currently (not streaming), fix that
      const translatedRdf = await translate(
        stream, target.url, resource.contentType, target.contentTypeRequested())
      debug(target.url + ' translating ' + resource.contentType + ' -> ' +
        target.contentTypeRequested())

      return {
        status: 200,
        resource,
        responseBody: translatedRdf,
        contentType: target.contentTypeRequested()
      }
    } catch (error) {
      debug('error translating: ' + target.url + ' ' + resource.contentType +
        ' -> ' + target.contentTypeRequested() + ' -- ' + 500 + ' ' +
        error.message)
      throw new HttpError(400, 'Error translating between RDF formats')
    }
  }

  static async putResource ({ ldpStore, resource, stream }) {
    const status = resource.exists ? 204 : 201
    try {
      await ldpStore.createResource({ resource, stream })
    } catch (error) {
      // log error here
      throw error
    }
    return { status, resource }
  }

  static async putContainer ({ ldpStore, container }) {
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

  /**
   * @returns {Set|null} Set of permissions required to perform this request.
   *   null in case of Options requests (no permissions required).
   */
  get requiredPermissions () {
    throw new Error('requiredPermissions must be implemented in subclass')
  }

  writeHeaders ({ res, result, permissions }) {
    this.writeCommonHeaders({res, result, permissions})
  }

  /**
   * @param res {object} Express response object
   * @param result {object} Result of ldpRequest.perform()
   */
  writeCommonHeaders ({res, result = {}, permissions}) {
    const { resource } = this
    const contentType = result.contentType || resource.contentType

    // res.set('X-Powered-By', 'Life Server/' + version)
    // res.set('Vary', 'Accept, Authorization, Origin')
    // // Set default Allow methods
    // res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')

    // set headers in common to all LDP responses
    if (result.headerMeta) {
      addLinks(res, result.headerMeta)
    }

    if (resource) { // delete request don't return a result, for example
      res.set('Content-Type', contentType)
      if (resource.contentLength) {
        res.set('Content-Length', resource.contentLength)
      }
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

      if (await ldpStore.exists({ target: indexFile }) && target.contentType() === 'text/html') {
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
  writeResponse ({ res }) {
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

      if (await ldpStore.exists({ target: indexFile }) && target.isHtml) {
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

  /**
   * Performs an LDP GET request on a non-container resource.
   *
   * @throws {HttpError} 404 if resource does not exist
   * @returns {Promise<object>} Ldp request result
   */
  async perform () {
    const { ldpStore, resource, target } = this

    if (!resource.exists) {
      throw new HttpError(404)
    }

    let stream

    try {
      stream = await ldpStore.createReadStream({ resource })
    } catch (error) {
      // console.log('Error performing GET request:', error)
      throw error
    }

    // If the requested content-type matches the content we found, all good
    const contentTypeMatch = target.contentTypeRequested([resource.contentType])
    const noTranslationNeeded = target.htmlRequested && !resource.isRdf
    if (contentTypeMatch || noTranslationNeeded) {
      return { status: 200, stream, resource }
    }

    // If the requested content-type wasn't RDF, AND it doesn't match the
    // file's content type, no translation is possible
    if (!target.rdfRequested) {
      throw new HttpError(406, 'Cannot serve requested type: ' +
        target.contentTypeRequested())
    }

    // Attempt to translate from one RDF serialization to another
    return LdpRequest.translateStream({ stream, target, resource })
  }

  /**
   * Writes response of LdpGetRequest
   *
   * @param res {ServerResponse}
   * @param result {object} Result of an LdpRequest.perform()
   */
  writeResponse ({ res, result = {} }) {
    const status = result.status || 200
    const responseBody = result.responseBody || 'OK'

    res.status(status)

    if (result && result.stream) {
      return result.stream.pipe(res)
    } else {
      res.send(responseBody)
    }
  }
}

class LdpRangeRequest extends LdpGetRequest {}

class LdpListContainerRequest extends LdpGetRequest {
  /**
   * Performs an LDP GET request on a container resource.
   *
   * @throws {HttpError} 404 if container does not exist
   * @returns {Promise<object>} Ldp request result
   */
  async perform () {
    const { resource: container, target, ldpStore } = this

    if (!container.exists) {
      throw new HttpError(404)
    }

    // Start with the container's .meta graph
    const graph = await this.ldpStore.readContainerMeta({ container })

    // Add the container's own stats to graph
    container.addStatsToGraph({ graph })

    // Add triples for each file and dir in the container
    container.resourceNames = await ldpStore.loadContentsList({ container })
    container.resources = await ldpStore.loadContentsDetails({ container })
    for (const resource of container.resources) {
      resource.addStatsToGraph({ graph })
    }

    // Serialize the graph using requested content type
    // target, kb, base, contentType
    let contentType = target.contentTypeRequested()
    contentType = contentType === '*/*' ? DEFAULT_RDF_TYPE : contentType
    const responseBody = await serialize(
      null, graph, target.url, contentType
    )

    return {
      status: 200,
      resource: container,
      responseBody,
      contentType
    }
  }
}

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
   * @returns {Promise<object>} Ldp request result
   */
  async perform () {
    const { ldpStore, resource } = this

    return resource.isContainer
      ? LdpRequest.putContainer({ ldpStore, container: resource })
      : LdpRequest.putResource({ ldpStore, resource, stream: this.bodyStream })
  }

  writeHeaders ({ res, result, permissions }) {
    this.writeCommonHeaders({ res, result, permissions })

    const { resource } = result

    res.set('Location', resource.target.url)
  }

  writeResponse ({ res, result }) {
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

  /**
   * Performs an LDP POST request
   *
   * @returns {Promise<object>} Ldp request result
   */
  async perform () {
    const { resource: container, headers, ldpStore } = this
    const { link, 'content-type': bodyContentType } = headers
    let { slug } = headers

    if (!this.resource.isContainer) {
      throw new HttpError(405, 'POST is only supported on containers')
    }
    if (!container.exists) {
      throw new HttpError(404, `Container ${container.target.url} not found`)
    }
    const headerMeta = parseMetadataFromHeader(link)

    // Handle multipart file upload
    const multipartUpload = bodyContentType &&
      bodyContentType.includes('multipart/form-data')
    if (multipartUpload) {
      await this.performMultipartUpload()
      return { status: 201, statusText: 'Created', resource: container, headerMeta }
    }

    // prepare slug
    if (slug) {
      slug = decodeURIComponent(slug)
      if (slug.match(/\/|\||:/)) {
        throw new HttpError(400, 'The name of new file POSTed may not contain : | or /')
      }
    }

    // The target filename will be determined from the Slug: header
    const target = await ldpStore.targetFromSlug({
      slug, container, headerMeta, bodyContentType
    })
    const resource = await ldpStore.resourceFor({ target })

    await resource.isContainer
      ? LdpRequest.putContainer({ ldpStore, container: resource })
      : LdpRequest.putResource({ ldpStore, resource, stream: this.bodyStream })

    return { status: 201, statusText: 'Created', resource, headerMeta }
  }

  /**
   * @returns {Promise}
   */
  async performMultipartUpload () {
    const { headers, ldpStore, bodyStream, resource: container } = this
    const busboy = new Busboy({ headers })

    return new Promise((resolve, reject) => {
      busboy.on('file', (fieldName, fileStream, filename, encoding, contentType) => {
        debug('One file received via multipart: ' + filename)

        const fileUrl = url.resolve(container.target.url, filename)
        const target = new LdpTarget({
          name: filename, url: fileUrl, bodyContentType: contentType
        })
        ldpStore.resource({ target, contentType })
          .then(resource => ldpStore.createResource({ resource, stream: fileStream }))
          .catch(error => busboy.emit('error', error))
      })
      busboy.on('error', error => {
        debug('Error receiving the file: ' + error.message)
        reject(new HttpError(400, 'Error uploading file: ' + error))
      })
      // Handled by backpressure of streams!
      busboy.on('finish', () => {
        debug('Done storing files')
        resolve()
      })

      bodyStream.pipe(busboy)
    })
  }

  writeHeaders ({ res, result, permissions }) {
    this.writeCommonHeaders({ res, result, permissions })

    const { resource } = result
    res.set('location', resource.target.url)
  }

  writeResponse ({ res, result }) {
    res.status(result.status).send(result.statusText)
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

  async perform () {}

  writeHeaders ({ res, result, permissions }) {
    this.writeCommonHeaders({ res, result, permissions })

    res.header('MS-Author-Via', 'SPARQL')
  }

  writeResponse ({ res, result }) {
    res.status(result.status).send(result.statusText)
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
 *   does) - currently does this
 * - Future: Use an authenticated fetch (pass along the requester's
 *   bearer credentials, for example) so that they can COPY from
 *   private resources.
 *
 * Throws:
 * - 400 'Source header required' error if Source: header is missing
 * - 400 If something else goes wrong while copying data
 * - 404 if source resource is not found
 */
class LdpCopyRequest extends LdpRequest {
  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([ acl.CONTROL ])
      : new Set([ acl.WRITE ])
  }

  async perform () {
    const { headers, target, resource, host, ldpStore } = this
    const copyFrom = headers['source']
    if (!copyFrom) {
      throw new HttpError(400, 'Source header required')
    }

    const relativeUrl = !url.parse(copyFrom).hostname
    const copyFromUrl = relativeUrl ? url.resolve(host.serverUri, copyFrom) : copyFrom
    const copyToUrl = target.url

    await ldpStore.copyResource({ copyFromUrl, copyToResource: resource })

    return { status: 201, copyFromUrl, copyToUrl, resource }
  }

  writeHeaders ({ res, result, permissions }) {
    const { copyToUrl } = result
    this.writeCommonHeaders({ res, result, permissions })

    res.set('Location', copyToUrl)
  }

  /**
   * @param res {ServerResponse}
   */
  writeResponse ({ res, result }) {
    res.sendStatus(201)
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
    return null // Options can be performed on any resource
  }

  async perform () {
    const { resource } = this

    const headerMeta = new Metadata()
    headerMeta.isContainer = resource.isContainer
    headerMeta.isBasicContainer = resource.isContainer
    headerMeta.isSourceResource = resource.isRdf

    return { status: 204, headerMeta, resource }
  }

  writeHeaders ({ res, result, permissions }) {
    const { resource } = result
    this.writeCommonHeaders({ res, result, permissions })
    const { serverUri } = this.host

    res.header('Accept-Patch', 'application/sparql-update')
    if (resource.isContainer) {
      res.header('Accept-Post', '*/*')
    }

    // Add a service "rel" link (service description endpoint)
    addLink(res, url.resolve(serverUri, '.well-known/solid'), 'service')

    // Add an issuer "rel" link
    const oidcProviderUri = this.host.serverUri
    addLink(res, oidcProviderUri, 'http://openid.net/specs/connect/1.0/issuer')
  }

  /**
   * @param res {ServerResponse}
   */
  writeResponse ({ res, result }) {
    res.sendStatus(204)
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
  LdpRequest,
  LdpHeadRequest,
  LdpGetRequest,
  LdpRangeRequest,
  LdpListContainerRequest,
  LdpPutRequest,
  LdpPostRequest,
  LdpPatchRequest,
  LdpDeleteRequest,
  LdpCopyRequest,
  LdpOptionsRequest
}
