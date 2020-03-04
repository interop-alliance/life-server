'use strict'

const { LdpResource, LdpContainer } = require('../ldp-resource')

class LdpFileResource extends LdpResource {
  /**
   * @param target {LdpTarget}
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist on the file system
   * @param path {string} Full file path
   * @param serverMeta {LdpServerMeta}
   */
  constructor ({ target, path, encoding, exists, serverMeta }) {
    super({ target, encoding, exists, serverMeta })
    this.path = path
  }
}

class LdpFileContainer extends LdpContainer {
  /**
   * @param target {LdpTarget}
   * @param exists {boolean}
   * @param serverMeta {LdpServerMeta}
   * @param path {string} Full file path
   * @param [resourceNames=[]] {Array<string>} Directory file contents
   * @param [resources=[]] {Array<LdpFileResource|LdpFileContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   *
   */
  constructor ({
    target, path, exists, serverMeta, resourceNames, resources
  }) {
    super({ target, exists, serverMeta, resourceNames, resources })
    this.path = path
  }
}

module.exports = {
  LdpFileResource,
  LdpFileContainer
}
