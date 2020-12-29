'use strict'

const rdf = require('rdflib')
const { URL } = require('url')
const ns = require('solid-namespace')(rdf)
const mime = require('mime-types')

const { DEFAULT_ENCODING, DEFAULT_RDF_TYPE, RDF_MIME_TYPES } = require('../defaults')

class LdpServerMeta {
  /**
   * @param [contentType] {string}
   * @param [modified] {Date} stats.mtime
   * @param [size] {number} size in bytes
   */
  constructor ({ contentType = DEFAULT_RDF_TYPE, modified, size } = {}) {
    this.contentType = contentType
    this.modified = modified || new Date()
    this.size = size
  }
}

class LdpObject {
  /**
   *
   * @param target {LdpTarget}
   * @param parent {LdpContainer} Parent container holding this resource.
   *   Conceptually, a resource always has a parent container (even if this
   *   property has not been initialized).
   * @param exists {boolean} Does resource exist?
   * @param serverMeta {LdpServerMeta}
   */
  constructor ({ target, parent, exists, serverMeta }) {
    this.target = target
    this.parent = parent
    this.exists = exists
    this.serverMeta = serverMeta
  }

  get contentType () {
    return this.serverMeta.contentType
  }

  get size () {
    return this.serverMeta.size
  }
}

class LdpResource extends LdpObject {
  /**
   * @param target {LdpTarget}
   * @param parent {LdpContainer} Parent container holding this resource.
   *   Conceptually, a resource always has a parent container (even if this
   *   property has not been initialized).
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist?
   * @param serverMeta {LdpServerMeta}
   */
  constructor ({ target, parent, encoding, exists, serverMeta }) {
    super({ target, parent, exists, serverMeta })
    this.encoding = encoding || DEFAULT_ENCODING
    this.isContainer = false
  }

  get isHtml () {
    return this.contentType && this.contentType.includes('html')
  }

  get isRdf () {
    return this.contentType && RDF_MIME_TYPES.includes(this.contentType)
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

    if (this.serverMeta.modified) {
      graph.add(
        url,
        ns.dct('modified'),
        this.serverMeta.modified) // An actual datetime value from a Date object
    }

    graph.add(
      url,
      ns.stat('size'),
      this.serverMeta.size)

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

class LdpContainer extends LdpObject {
  /**
   * @param target {LdpTarget}
   * @param parent {LdpContainer|null} Parent container holding this container.
   *   Conceptually, a container always has a parent container (even if this
   *   property has not been initialized), unless it is the root container,
   *   in which case the value is `null`.
   * @param exists {boolean}
   * @param [resourceNames=[]] {Array<string>} Container contents
   * @param [resources=[]] {Array<LdpResource|LdpContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   * @param [serverMeta] {LdpServerMeta}
   */
  constructor ({
    target, parent, exists, resourceNames = [], resources = [], serverMeta
  }) {
    super({ target, parent, exists, serverMeta })
    this.resourceNames = resourceNames
    this.resources = resources
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
      this.serverMeta.modified) // An actual datetime value from a Date object

    graph.add(
      url,
      ns.stat('size'),
      this.serverMeta.size)

    return graph
  }

  get resourceUrls () {
    return this.resourceNames.map((name) => [
      name, (new URL(name, this.target.url)).toString()
    ])
  }
}

module.exports = {
  LdpObject,
  LdpResource,
  LdpContainer,
  LdpServerMeta
}
