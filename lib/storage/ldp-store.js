'use strict'

const { ACL_SUFFIX, META_SUFFIX } = require('../constants')

class LdpStore {
  /**
   * @param host {SolidHost}
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
   * Creates a directory for a given container (if it doesn't exist already),
   * similar to a `mkdir -p` command.
   *
   * TODO: Consider having it return the container that was created (make sure
   *   its `exists` attribute is set.
   *
   * @param container
   * @returns {Promise<void>}
   */
  async createContainer ({ container }) {
    throw new Error('createContainer() must be implemented in subclass.')
  }

  /**
   * Creates the container (if it doesn't exist already),
   * similar to a `mkdir -p` command.
   *
   * @param container {LdpContainer}
   * @returns {Promise<void>}
   */
  async ensureContainer ({ container }) {
    throw new Error('ensureContainer() must be implemented in subclass.')
  }

  /**
   * Resolves with the resource when the write stream
   *   sends the `finish` event
   *
   * @param resource {LdpResource}
   * @param fromStream {ReadableStream} From incoming request, body stream
   *
   * @returns {Promise<WritableStream>}
   */
  async createResource ({ resource, fromStream }) {
    throw new Error('createResource() must be implemented in subclass.')
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
   * Loads an RDF resource from the store, parses it, and returns the resulting
   * graph.
   *
   * @param [resource] {LdpResource}
   *
   * @param [graph] {IndexedFormula}
   * @param [contentType] {string}
   *
   * @returns {Promise<IndexedFormula>} Resolves with parsed graph
   */
  async loadParsedGraph ({ resource, graph, contentType }) {
    throw new Error('loadParsedGraph() must be implemented in subclass.')
  }

  /**
   * Writes the contents of the blob to the store.
   * Warning: This is a buffering operation, so whenever possibly, prefer to
   * use `createWriteStream()` instead.
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
   * Loads the details on each resource in a container's resource list
   *
   * @param container {LdpContainer}
   *
   * @returns {Promise<Array<LdpResource|LdpContainer>>}
   */
  async loadContentsDetails ({ container }) {
    throw new Error('loadContentsDetails() must be implemented in subclass.')
  }

  /**
   * Creates an LdpResource from an LdpTarget
   *
   * @returns {Promise<LdpResource|LdpContainer>}
   */
  // async resource () {
  //   throw new Error('resource() must be implemented in subclass.')
  // }
}

module.exports = {
  LdpStore
}
