'use strict'

const { resolve } = require('url')

const { DEFAULT_ENCODING, DEFAULT_RDF_TYPE, RDF_MIME_TYPES } = require('../../constants')

class LdpResource {
  /**
   * @param target {LdpTarget}
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist?
   * @param contentType {string}
   */
  constructor ({ target, encoding, exists, contentType }) {
    this.target = target
    this.encoding = encoding || DEFAULT_ENCODING
    this.exists = exists
    this.contentType = contentType
    this.isContainer = false
  }

  get isHtml () {
    return this.contentType && this.contentType.includes('html')
  }

  isRdf () {
    return this.isRdf ||
      this.contentType && RDF_MIME_TYPES.includes(this.contentType)
  }
}

class LdpContainer {
  /**
   * @param target {LdpTarget}
   * @param exists {boolean}
   * @param [contentType] {string}
   * @param [encoding] {string}
   * @param [resourceNames=[]] {Array<string>} Container contents
   * @param [resources=[]] {Array<LdpResource|LdpContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   */
  constructor ({ target, exists, contentType = DEFAULT_RDF_TYPE,
                 encoding = DEFAULT_RDF_TYPE, resourceNames = [],
                 resources = [] }) {
    this.target = target
    this.exists = exists
    this.contentType = contentType
    this.encoding = encoding
    this.resourceNames = resourceNames
    this.resources = resources
    this.isContainer = true
  }

  // normalizeUrl () {
  //   if (!this.path.endsWith('/')) {
  //     this.path += '/'
  //   }
  //
  //   if (!this.target.url.endsWith('/')) {
  //     this.target.url += '/'
  //   }
  //
  //   if (!this.target.name.endsWith('/')) {
  //     this.target.name += '/'
  //   }
  // }

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
  constructor ({target, path, contentType, encoding, exists, fsStats}) {
    super({ target, encoding, exists, contentType })
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
  constructor ({ target, path, exists, fsStats, contentType, encoding,
                 resourceNames, resources }) {
    super({ target, exists, contentType, encoding, resourceNames, resources })
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
