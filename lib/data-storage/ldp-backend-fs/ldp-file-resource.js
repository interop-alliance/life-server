'use strict'

const { LdpResource, LdpContainer } = require('../ldp-resource')

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
   * @param contentType {string}
   * @param encoding {string}
   * @param [resourceNames=[]] {Array<string>} Directory file contents
   * @param [resources=[]] {Array<LdpFileResource|LdpFileContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   *
   */
  constructor ({
    target, path, exists, fsStats = {}, contentType, encoding,
    resourceNames, resources
  }) {
    super({ target, exists, contentType, encoding, resourceNames, resources, modified: fsStats.mtime, size: fsStats.size })
    this.path = path
    this.fsStats = fsStats
  }
}

module.exports = {
  LdpFileResource,
  LdpFileContainer
}
