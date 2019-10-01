'use strict'

const { resolve } = require('url')

const { DEFAULT_ENCODING, DEFAULT_RDF_TYPE } = require('../../constants')

class LdpResource {
  /**
   * @param target {LdpTarget}
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist?
   * @param mediaType {string}
   */
  constructor ({ target, encoding, exists, mediaType }) {
    this.target = target
    this.encoding = encoding || DEFAULT_ENCODING
    this.exists = exists
    this.mediaType = mediaType
    this.isContainer = false
  }
}

class LdpContainer {
  /**
   * @param target {LdpTarget}
   * @param exists {boolean}
   * @param [mediaType] {string}
   * @param [encoding] {string}
   * @param [resourceNames=[]] {Array<string>} Container contents
   * @param [resources=[]] {Array<LdpResource|LdpContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   */
  constructor ({ target, exists, mediaType = DEFAULT_RDF_TYPE,
                 encoding = DEFAULT_RDF_TYPE, resourceNames = [],
                 resources = [] }) {
    this.target = target
    this.exists = exists
    this.mediaType = mediaType
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
   * @param mediaType {string}
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist on the file system
   * @param path {string} Full file path
   * @param fsStats {fs.Stats}
   */
  constructor ({target, path, mediaType, encoding, exists, fsStats}) {
    super({ target, encoding, exists, mediaType })
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
  constructor ({ target, path, exists, fsStats, mediaType, encoding,
                 resourceNames, resources }) {
    super({ target, exists, mediaType, encoding, resourceNames, resources })
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
