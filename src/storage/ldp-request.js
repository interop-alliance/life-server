'use strict'

const { URL } = require('url')
const Busboy = require('busboy')
const { ApiRequest } = require('../api-request')
const acl = require('@interop/solid-permissions')
const HttpError = require('standard-http-error')
const { LdpTarget } = require('./ldp-target')
const Negotiator = require('negotiator')
const { promisify } = require('util')
const rdf = require('rdflib')
const serialize = promisify(rdf.serialize)
const translateRdfStream = promisify(require('../rdf').translateRdfStream)
const { addLinks, addLink, Metadata } = require('./ldp-header')
const { logger } = require('../logger')
const { DEFAULT_RDF_TYPE } = require('../defaults')

class LdpRequest extends ApiRequest {
  /**
   * @param target {LdpTarget}
   * @param resource {LdpResource}
   * @param headers {object}
   * @param [bodyStream] {Stream} Request body stream, for parsing when
   *   needed
   * @param ldpStore {LdpStore}
   * @param [credentials] {object} Credentials object,
   *   contains WebID string, as well as any bearer credentials/tokens. Needed
   *   for authenticated fetch (of remote group ACLs, of Copy resources, etc).
   *   Null if request is not authenticated.
   * @param host {ServerHost}
   * @param headerMeta {Metadata}
   * @param [storage] {StorageManager}
   */
  constructor ({ target, resource, headers, bodyStream, ldpStore, credentials, host, headerMeta, storage }) {
    super({ host, credentials, storage })
    this.headers = headers
    this.headerMeta = headerMeta
    this.bodyStream = bodyStream

    this.target = target
    this.resource = resource
    this.ldpStore = ldpStore
    // this.body = body ?
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
   * Creates and returns an LdpTarget instance for a given LDP request
   *
   * @param req {IncomingRequest} Express req
   * @param host {ServerHost}
   * @returns {LdpTarget}
   */
  static target ({ req, host }) {
    return new LdpTarget(this.parseTarget({ req, host }))
  }

  /**
   * Parses target options. (Separate function from target() for easier unit
   * testing.)
   * @param req {IncomingRequest} Express req
   * @param host {ServerHost}
   * @returns {{conneg: Negotiator, bodyContentType: string, name: string, url: string}}
   */
  static parseTarget ({ req, host }) {
    const targetUrl = host.parseTargetUrl(req)
    const conneg = new Negotiator(req)
    const bodyContentType = req.get('content-type')

    return { name: req.path, url: targetUrl, bodyContentType, conneg }
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
      const translatedRdf = await translateRdfStream(
        stream, target.url, resource.contentType, target.contentTypeRequested())
      logger.info(target.url + ' translating ' + resource.contentType + ' -> ' +
        target.contentTypeRequested())

      return {
        status: 200,
        resource,
        responseBody: translatedRdf,
        contentType: target.contentTypeRequested()
      }
    } catch (error) {
      logger.warn('error translating: ' + target.url + ' ' + resource.contentType +
        ' -> ' + target.contentTypeRequested() + ' -- ' + 500 + ' ' +
        error.message)
      throw new HttpError(400, 'Error translating between RDF formats')
    }
  }

  static async putResource ({ ldpStore, resource, stream }) {
    const status = resource.exists ? 204 : 201
    try {
      await ldpStore.writeResourceStream({ resource, fromStream: stream })
    } catch (error) {
      logger.warn('Error in putResource: ' + error)
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
      await ldpStore.ensureContainer({ container })
    } catch (error) {
      logger.warn('Error in putContainer: ' + error)
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

  /**
   * @param res
   * @param result
   * @param permissions {PermissionSet}
   */
  writeHeaders ({ res, result, permissions }) {
    this.writeCommonHeaders({ res, result, permissions })
  }

  /**
   * @param res {object} Express response object
   * @param result {object} Result of ldpRequest.perform()
   */
  writeCommonHeaders ({ res, result = {}, permissions }) {
    const { resource, target } = this
    const contentType = result.contentType || resource.contentType
    const headerMeta = result.headerMeta || this.headerMeta

    // res.set('X-Powered-By', 'Life Server/' + version)
    // res.set('Vary', 'Accept, Authorization, Origin')
    // // Set default Allow methods
    // res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')

    // Add ACL and Meta Link in header
    addLink(res, target.aclUrl, 'acl')
    addLink(res, target.metaUrl, 'describedBy')

    // set headers in common to all LDP responses
    if (headerMeta) {
      addLinks(res, headerMeta)
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
      const indexFileUrl = (new URL('index.html', target.url)).toString()
      const indexFile = new LdpTarget({ url: indexFileUrl, conneg: target.conneg })

      if (await ldpStore.exists({ target: indexFile }) && target.contentType() === 'text/html') {
        // This is a browser and an index file exists, return it
        return new LdpHeadRequest({ target: indexFile, ...options })
      }
    }

    // plain head request
    return new LdpHeadRequest(options)
  }

  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([acl.CONTROL])
      : new Set([acl.READ])
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
   * @returns {LdpGetRequest|LdpListContainerRequest|LdpRangeRequest|DataViewerRequest}
   */
  static async from (options) {
    const { ldpStore, target, headers, resource } = options

    if (headers.range) {
      return new LdpRangeRequest(options)
    }

    // Check to see if it's a request for a data viewer
    if (!target.isContainer && target.htmlRequested && resource.isRdf) {
      return DataViewerRequest.from(options)
    }

    if (target.isContainer) {
      // if it is a container, check to see if index.html exists
      const indexFileUrl = (new URL('index.html', target.url)).toString()
      const indexFile = new LdpTarget({ url: indexFileUrl, conneg: target.conneg })

      if (target.htmlRequested) {
        if (await ldpStore.exists({ target: indexFile })) {
          // This is a browser and an index file exists, return it
          options.resource = await ldpStore.resource({ target: indexFile })
          return new LdpGetRequest({ target: indexFile, ...options })
        } else {
          // This is a container request by a browser, no index.html exists
          return DataViewerRequest.from(options)
        }
      }

      return new LdpListContainerRequest(options)
    }

    // plain get request
    return new LdpGetRequest(options)
  }

  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([acl.CONTROL])
      : new Set([acl.READ])
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

    const stream = await ldpStore.createReadStream({ resource })

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

class DataViewerRequest extends LdpGetRequest {
  /**
   * @param options {object} See constructor of LdpGetRequest and LdpRequest.
   *
   * @returns {DataViewerRequest}
   */
  static async from (options) {
    return new DataViewerRequest(options)
  }

  async perform ({ response }) {
    if (!this.resource.exists) {
      throw new HttpError(404)
    }

    if (this.resource.isContainer) {
      await this.viewContainer({ response })
    } else {
      await this.viewResource({ response })
    }

    return {
      status: 200,
      contentType: this.target.contentTypeRequested()
    }
  }

  async viewContainer ({ response }) {
    const container = this.resource
    container.resourceNames = await this.ldpStore.loadContentsList({ container })
    container.resources = await this.ldpStore.loadContentsDetails({ container })

    response.render('viewers/container', {
      title: container.target.name,
      container,
      resources: container.resources,
      webId: this.credentials.webId
    })
  }

  async viewResource ({ response }) {
    const contents = await this.ldpStore.readBlob({ resource: this.resource })

    response.render('viewers/resource', {
      title: this.resource.target.name,
      contents
    })
  }

  writeResponse () {
    // FIXME - move render logic into here
    // Do nothing - response is already rendered in view*() methods above
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
      ? new Set([acl.CONTROL])
      : new Set([acl.WRITE])
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
      ? new Set([acl.CONTROL])
      : new Set([acl.APPEND])
  }

  /**
   * Performs an LDP POST request
   *
   * @returns {Promise<object>} Ldp request result
   */
  async perform () {
    const { resource: container, headers, ldpStore, headerMeta } = this
    const { 'content-type': bodyContentType } = headers
    let { slug } = headers

    if (!this.resource.isContainer) {
      throw new HttpError(405, 'POST is only supported on containers')
    }
    if (!container.exists) {
      throw new HttpError(404, `Container ${container.target.url} not found`)
    }
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
    const resource = await ldpStore.resource({ target })

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
        logger.info('One file received via multipart: ' + filename)

        const fileUrl = (new URL(filename, container.target.url)).toString()
        const target = new LdpTarget({
          name: filename, url: fileUrl, bodyContentType: contentType
        })
        const resource = ldpStore.addResource({ target, contentType })
        return ldpStore.writeResourceStream({ resource, fromStream: fileStream })
          .catch(error => busboy.emit('error', error))
      })
      busboy.on('error', error => {
        logger.warn('Error receiving the file: ' + error.message)
        reject(new HttpError(400, 'Error uploading file: ' + error))
      })
      // Handled by backpressure of streams!
      busboy.on('finish', () => {
        logger.info('Done storing files')
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

// Patch parsers by request body content type
const PATCH_PARSERS = {
  'application/sparql-update': require('./patch-parsers/sparql-update-parser'),
  'text/n3': require('./patch-parsers/n3-patch-parser.js')
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
  /**
   * @param options {object} See LdpRequest constructor
   *
   * @param options.patch {object} Patch details document
   * @param options.patch.text {string} Parsed patch request body
   * @param options.patch.uri {string} `target.url#patch-${hash(patch.text)}`
   * @param options.patch.contentType {string}
   * @param options.patch.parsed {object} Result of `parsePatchObject()`
   */
  constructor (options) {
    super(options)
    this.patch = options.patch
  }

  /**
   * @returns {Set<string>} Set of permissions required for this PATCH request
   */
  get requiredPermissions () {
    const { patch: { parsed: parsedPatch }, target } = this
    let permissions

    // Read access is required for DELETE and WHERE.
    // If we would allows users without read access,
    // they could use DELETE or WHERE to trigger 200 or 409,
    // and thereby guess the existence of certain triples.
    // DELETE additionally requires write access.
    if (target.isAcl) {
      return new Set([acl.CONTROL])
    } else if (parsedPatch.delete) {
      permissions = new Set([acl.READ, acl.WRITE])
    } else if (parsedPatch.where) {
      permissions = new Set([acl.READ, acl.APPEND])
    } else {
      permissions = new Set([acl.APPEND])
    }
    return permissions
  }

  static async parsePatchObject ({ target, patch }) {
    const parsePatch = PATCH_PARSERS[patch.contentType]
    if (!parsePatch) {
      throw new HttpError(415, `Unsupported patch content type: ${patch.contentType}`)
    }

    return parsePatch(target.url, patch.uri, patch.text)
  }

  /**
   * Performs the PATCH request.
   *
   * @throws {HttpError} 415 Unsupported patch content type
   *
   * @returns {Promise<object>}
   */
  async perform () {
    const { target, resource, patch, ldpStore } = this
    logger.info('PATCH -- Target <%s> (%s)' + target.url + ' ' + resource.contentType)
    logger.info('PATCH -- Received patch (%d bytes, %s) ' + patch.text.length +
      ' ' + patch.contentType)

    // Parse the target graph (to apply the patch to)
    let graph
    try {
      graph = await ldpStore
        .loadParsedGraph({ resource, contentType: resource.contentType })
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      graph = rdf.graph()
    }

    await LdpPatchRequest.applyPatch(patch.parsed, graph, target)
    await ldpStore.writeGraph({ resource, graph, contentType: resource.contentType })

    return { status: 200, resource, statusText: 'Patch applied successfully.\n' }
  }

  writeHeaders ({ res, result, permissions }) {
    this.writeCommonHeaders({ res, result, permissions })

    res.header('MS-Author-Via', 'SPARQL')
  }

  writeResponse ({ res, result }) {
    res.status(result.status).send(result.statusText)
  }

  /**
   * Applies the patch to the RDF graph.
   *
   * @param patchObject {object} Patch details document
   * @param patchObject.text {string} Parsed patch request body
   * @param patchObject.uri {string} `target.url#patch-${hash(patch.text)}`
   * @param patchObject.contentType {string}
   * @param graph {IndexedFormula}
   * @param target {LdpTarget}
   *
   * @returns {Promise<IndexedFormula>} Resolves with patched graph
   */
  static async applyPatch (patchObject, graph, target) {
    logger.info('PATCH -- Applying patch')
    return new Promise((resolve, reject) =>
      graph.applyPatch(patchObject, graph.sym(target.url), (error) => {
        if (error) {
          const message = error.message || error // returns string at the moment
          logger.warn(`PATCH -- FAILED. Returning 409. Message: '${message}'`)
          return reject(new HttpError(409, `The patch could not be applied. ${message}`))
        }
        resolve(graph)
      })
    )
  }
}

class LdpDeleteRequest extends LdpRequest {
  get requiredPermissions () {
    return this.target.isAcl
      ? new Set([acl.CONTROL])
      : new Set([acl.WRITE])
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

  writeResponse ({ res }) {
    // successfully deleted
    res.sendStatus(200, 'OK')
  }
}

/**
 * Handles HTTP COPY requests to import a given resource (specified in
 * the `Source:` header) to a destination (specified in request path).
 * For the moment, you can copy from public resources only (no auth
 * delegation is implemented), and is mainly intended for use with
 * "Save an external resource to your server" type apps.
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
      ? new Set([acl.CONTROL])
      : new Set([acl.WRITE])
  }

  async perform () {
    const { headers, target, resource, host, ldpStore } = this
    const copyFrom = headers.source
    if (!copyFrom) {
      throw new HttpError(400, 'Source header required')
    }

    let relativeUrl = false
    try {
      const parsedCopyFrom = new URL(copyFrom)
      relativeUrl = !parsedCopyFrom.hostname
    } catch (error) {
      relativeUrl = true
    }

    const copyFromUrl = relativeUrl
      ? (new URL(copyFrom, host.serverUri)).toString()
      : copyFrom
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
    addLink(res, (new URL('.well-known/solid', serverUri)).toString(), 'service')

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
  head: LdpHeadRequest,
  get: LdpGetRequest,
  put: LdpPutRequest,
  post: LdpPostRequest,
  patch: LdpPatchRequest,
  delete: LdpDeleteRequest,
  copy: LdpCopyRequest,
  options: LdpOptionsRequest
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
