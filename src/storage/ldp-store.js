'use strict'

const { ACL_SUFFIX, META_SUFFIX, DEFAULT_RDF_TYPE } = require('../defaults')
const { v1: uuidv1 } = require('uuid')
const { promisify } = require('util')
const rdf = require('rdflib')
const parseRdf = promisify(rdf.parse)
const serializeGraph = promisify(rdf.serialize)
const { LdpTarget } = require('./ldp-target')

class LdpStore {
  /**
   * @param host {ServerHost}
   */
  constructor ({ host } = {}) {
    this.host = host
  }

  /**
   * Creates an LdpResource from an LdpTarget, by mapping the target's
   * URL to the appropriate storage backend.
   *
   * @param target {LdpTarget}
   * @param target.url {string}
   *
   * @returns {Promise<LdpResource|LdpContainer>}
   */
  async resource ({ target }) {
    throw new Error('resource() must be implemented in subclass.')
  }

  /**
   * Creates a new Resource or Container instance. Used for creating new
   * resources rather than mapping to existing ones.
   *
   * Used in multi-file upload on POST.
   *
   * @param target
   * @param [contentType]
   * @param [encoding] {string}
   *
   * @returns {LdpFileResource}
   */
  addResource ({ target, contentType, encoding }) {
    throw new Error('addResource() must be implemented in subclass.')
  }

  /**
   * Creates an LdpTarget instance for a POST request (which includes a `slug`
   * value, and is done against a container).
   * If the target resource exists, appends a UUID to the target name (so that
   * POSTs only create resources, and not overwrite).
   *
   * @param [slug] {string} Suggested name of file or container to be created
   * @param container {LdpContainer} Parent container (in which target is to
   *   be created)
   * @param headerMeta {Metadata} Result of parsing `Link:` header
   * @param bodyContentType {string} Mime type of incoming request body
   *
   * @returns {LdpTarget}
   */
  async targetFromSlug ({ slug = uuidv1(), container, headerMeta, bodyContentType }) {
    throw new Error('targetFromSlug() must be implemented in subclass.')
  }

  /**
   * Checks to see if a given target resource exists in the store.
   *
   * @param target {LdpTarget}
   *
   * @returns {Promise<boolean>}
   */
  async exists ({ target }) {
    throw new Error('exists() must be implemented in subclass.')
  }

  /**
   * Creates the container (if it doesn't exist already),
   * similar to a `mkdir -p` command.
   *
   * TODO: Consider having it return the container that was created (make sure
   *   its `exists` attribute is set.
   *
   * @param container {LdpContainer}
   * @returns {Promise<void>}
   */
  async ensureContainer ({ container }) {
    throw new Error('ensureContainer() must be implemented in subclass.')
  }

  /**
   * Loads and parses the container's `.meta` resource.
   *
   * @param container {LdpContainer}
   *
   * @returns {Promise<IndexedFormula>} Resolves with the parsed `.meta` graph.
   */
  async readContainerMeta ({ container }) {
    let graph

    try {
      const metaTarget = new LdpTarget({ url: container.target.aclUrl })
      const metaResource = await this.resource({ target: metaTarget })
      graph = await this.loadParsedGraph({ resource: metaResource })
    } catch (error) {
      // do nothing, this is likely a 'not found' error
      graph = rdf.graph() // new/empty graph
    }

    return graph
  }

  /**
   * Resolves with the resource when the write stream sends the `finish` event.
   * This is non-buffering, and is preferable to `writeBlob()`.
   *
   * @param resource {LdpResource}
   * @param fromStream {ReadableStream} From incoming request, body stream
   *
   * @returns {Promise<WritableStream>}
   */
  async writeResourceStream ({ resource, fromStream }) {
    throw new Error('writeResourceStream() must be implemented in subclass.')
  }

  /**
   * Copies a resource from a remote url.
   *
   * @param copyFromUrl {string}
   * @param copyToResource {LdpResource}
   *
   * @returns {Promise<WriteStream>}
   */
  async copyResource ({ copyFromUrl, copyToResource }) {
    throw new Error('copyResource() must be implemented in subclass.')
  }

  /**
   * Creates a ReadableStream for a given resource. Use this instead of
   * `readBlob` whenever possible.
   *
   * @param resource {LdpResource}
   *
   * @returns {Promise<ReadableStream>}
   */
  async createReadStream ({ resource }) {
    throw new Error('createReadStream() must be implemented in subclass.')
  }

  /**
   * Creates a WritableStream for a given resource.
   *
   * @param resource {LdpResource}
   *
   * @return {WritableStream}
   */
  createWriteStream ({ resource }) {
    throw new Error('createWriteStream() must be implemented in subclass.')
  }

  /**
   * Buffers and returns the contents of a given blob.
   * Whenever possible, prefer streaming via `createReadStream()`.
   *
   * @param resource {LdpResource}
   * @param [encoding] {string}
   *
   * @returns {Promise<string|Buffer>}
   */
  async readBlob ({ resource, encoding }) {
    throw new Error('readBlob() must be implemented in subclass.')
  }

  /**
   * Loads an RDF file from the store, parses it, and returns the resulting
   * graph.
   *
   * @param [resource] {LdpResource}
   *
   * @param [graph] {IndexedFormula}
   * @param [contentType] {string}
   *
   * @throws {Error} Storage errors (resource does not exist)
   * @throws {Error} Graph parse errors.
   *
   * @returns {Promise<IndexedFormula>} Resolves with parsed graph
   */
  async loadParsedGraph ({
    resource, graph = rdf.graph(),
    contentType = DEFAULT_RDF_TYPE
  }) {
    const rawGraphContents = await this.readBlob({ resource })
    if (!rawGraphContents) {
      return graph
    }
    return parseRdf(rawGraphContents, graph, resource.target.url, contentType)
  }

  /**
   * Serializes and writes a graph to a given resource, and returns the original
   * (non-serialized) graph.
   *
   * @param resource {LdpResource}
   *
   * @param graph {IndexedFormula}
   * @param [contentType] {string}
   *
   * @return {Promise<IndexedFormula>}
   */
  async writeGraph ({ resource, graph, contentType = DEFAULT_RDF_TYPE }) {
    // target, kb, base, contentType
    const { url } = resource.target
    const graphRdf = await serializeGraph(null, graph, url, contentType)

    return this.writeBlob({ resource, blob: graphRdf })
  }

  /**
   * Attempts to fetch a graph first from the local store, and then via fetch,
   * and returns the parsed graph
   *
   * TODO: Only does local for now, not remote. Will use fetchRemoteGraph() in
   *   the future
   *
   * @param [url] {string}
   * @param [resource] {LdpResource}
   * @param graph {IndexedFormula}
   * @param contentType {string}
   * @returns {Promise<IndexedFormula>}
   */
  async fetchGraph ({ url, resource, graph, contentType = DEFAULT_RDF_TYPE }) {
    if (!resource) {
      const target = new LdpTarget({ url })
      resource = await this.resource({ target })
    }

    return this.loadParsedGraph({ resource, graph, contentType })
  }

  /**
   * Writes the contents of the blob to the store.
   * Warning: This is a buffering operation, so whenever possibly, prefer to
   * use `writeResourceStream()` instead.
   *
   * @param resource {LdpResource}
   * @param blob {string|Buffer}
   *
   * @throws {Error}
   *
   * @returns {Promise<void>}
   */
  async writeBlob ({ resource, blob }) {
    throw new Error('writeBlob() must be implemented in subclass.')
  }

  /**
   * Deletes a given container.
   * Note: Has `rm -rf` semantics, so you need to enforce proper "don't delete
   * if not empty" semantics in the calling code.
   *
   * @param container {LdpContainer}
   *
   * @returns {Promise}
   */
  async deleteContainer ({ container }) {
    throw new Error('deleteContainer() must be implemented in subclass.')
  }

  /**
   * Deletes a given resource.
   *
   * @param resource {LdpResource}
   *
   * @returns {Promise}
   */
  async deleteResource ({ resource }) {
    throw new Error('deleteResource() must be implemented in subclass.')
  }

  /**
   * Used when trying to delete a container, for example.
   *
   * @param container {LdpFileContainer}
   *
   * @returns {boolean}
   */
  isContainerEmpty (container) {
    const { resourceNames } = container
    let skipCount = 0
    if (resourceNames.indexOf(META_SUFFIX) > -1) {
      skipCount++
    }
    if (resourceNames.indexOf(ACL_SUFFIX) > -1) {
      skipCount++
    }
    return resourceNames.length === skipCount
  }

  /**
   * Loads the list of resources in a container (just the resource names).
   *
   * @param container {LdpContainer}
   *
   * @returns {Promise<Array<string>>}
   */
  async loadContentsList ({ container }) {
    throw new Error('loadContentsList() must be implemented in subclass.')
  }

  /**
   * Gets the details on each resource in a container's resource list.
   * Important: Must only be used after `loadContentsList()` is called.
   *
   * @param container {LdpContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise<Array<LdpResource|LdpContainer>>}
   */
  async loadContentsDetails ({ container }) {
    return Promise.all(
      container.resourceUrls.map(resource => {
        const [name, url] = resource
        return this.resource({ target: new LdpTarget({ name, url }) })
      })
    )
  }
}

module.exports = {
  LdpStore
}
