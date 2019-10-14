'use strict'

const { resolve } = require('url')
const rdf = require('rdflib')
const ns = require('solid-namespace')(rdf)
const mime = require('mime-types')

const { DEFAULT_ENCODING, DEFAULT_RDF_TYPE, RDF_MIME_TYPES } = require('../defaults')

class LdpResource {
  /**
   * @param target {LdpTarget}
   * @param parent {LdpContainer} Parent container holding this resource.
   *   Conceptually, a resource always has a parent container (even if this
   *   property has not been initialized).
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist?
   * @param modified {Date} stats.mtime
   * @param size {number} size in bytes
   * @param contentType {string}
   */
  constructor ({ target, parent, encoding, exists, modified, size, contentType }) {
    this.target = target
    this.parent = parent
    this.encoding = encoding || DEFAULT_ENCODING
    this.exists = exists
    this.modified = modified
    this.size = size
    this.contentType = contentType
    this.isContainer = false
  }

  get isHtml () {
    return this.contentType && this.contentType.includes('html')
  }

  get isRdf () {
    return this.isContainer ||
      this.contentType && RDF_MIME_TYPES.includes(this.contentType)
  }

  /**
   * Adds this resource's fs stats for container listing.
   *
   * @param graph {IndexedFormula}
   * @returns {IndexedFormula}
   */
  addStatsToGraph ({ graph = rdf.graph() }) {
    const url = graph.sym(this.target.url)

    graph.add(
      url,
      ns.rdf('type'),
      ns.ldp('Resource'))

    graph.add(
      url,
      ns.dct('modified'),
      this.modified) // An actual datetime value from a Date object

    graph.add(
      url,
      ns.stat('size'),
      this.size)

    const mimeType = mime.lookup(this.target.url)
    if (mimeType) { // Is the file has a well-known type,
      const type = 'http://www.w3.org/ns/iana/media-types/' + mimeType + '#Resource'
      graph.add(
        url,
        ns.rdf('type'), // convert MIME type to RDF
        graph.sym(type)
      )
    }

    return graph
  }
}

class LdpContainer {
  /**
   * @param target {LdpTarget}
   * @param parent {LdpContainer|null} Parent container holding this container.
   *   Conceptually, a container always has a parent container (even if this
   *   property has not been initialized), unless it is the root container,
   *   in which case the value is `null`.
   * @param exists {boolean}
   * @param [contentType] {string}
   * @param [encoding] {string}
   * @param [modified] {Date} stats.mtime
   * @param [size] {number} size in bytes
   * @param [resourceNames=[]] {Array<string>} Container contents
   * @param [resources=[]] {Array<LdpResource|LdpContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   */
  constructor ({ target, parent, exists, contentType = DEFAULT_RDF_TYPE,
                 modified, size, encoding = DEFAULT_RDF_TYPE, resourceNames = [],
                 resources = [] }) {
    this.target = target
    this.parent = parent
    this.exists = exists
    this.contentType = contentType
    this.encoding = encoding
    this.resourceNames = resourceNames
    this.resources = resources
    this.modified = modified
    this.size = size
    this.isContainer = true
  }

  get isHtml () {
    return this.contentType && this.contentType.includes('html')
  }

  get isRdf () {
    return true
  }

  /**
   * Adds this container's fs stats for container listing.
   *
   * @param graph {IndexedFormula}
   * @returns {IndexedFormula}
   */
  addStatsToGraph ({ graph = rdf.graph() }) {
    const url = graph.sym(this.target.url)

    // Add the triples for the container's stats
    graph.add(
      url,
      ns.rdf('type'),
      ns.ldp('Resource'))

    graph.add(
      url,
      ns.rdf('type'),
      ns.ldp('BasicContainer'))

    graph.add(
      url,
      ns.rdf('type'),
      ns.ldp('Container'))

    // Add the triples for the directory contents
    graph.add(
      url,
      ns.dct('modified'),
      this.modified) // An actual datetime value from a Date object

    graph.add(
      url,
      ns.stat('size'),
      this.size)

    return graph
  }

  get resourceUrls () {
    return this.resourceNames.map((name) => [name, resolve(this.target.url, name)])
  }
}

class LdpFileResource extends LdpResource {
  /**
   * @param target {LdpTarget}
   * @param contentType {string} Resource's contentType, determined by mapper,
   *   from file extension etc.
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist on the file system
   * @param path {string} Full file path
   * @param fsStats {fs.Stats}
   */
  constructor ({ target, path, contentType, encoding, exists, fsStats = {} }) {
    super({ target, encoding, exists, contentType, modified: fsStats.mtime, size: fsStats.size })
    this.path = path
    this.fsStats = fsStats
  }
}

class LdpFileContainer extends LdpContainer {
  /**
   * @param target {LdpTarget}
   * @param exists {boolean}
   * @param path {string} Full file path
   * @param fsStats {fs.Stats}
   * @param [resourceNames=[]] {Array<string>} Directory file contents
   * @param [resources=[]] {Array<LdpFileResource|LdpFileContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   *
   */
  constructor ({ target, path, exists, fsStats = {}, contentType, encoding,
                 resourceNames, resources }) {
    super({ target, exists, contentType, encoding, resourceNames, resources, modified: fsStats.mtime, size: fsStats.size })
    this.path = path
    this.fsStats = fsStats
  }
}

module.exports = {
  LdpResource,
  LdpContainer,
  LdpFileResource,
  LdpFileContainer
}
