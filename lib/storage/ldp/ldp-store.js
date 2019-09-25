'use strict'

const DEFAULT_ACL_SUFFIX = '.acl'

class LdpStore {
  constructor ({ suffixAcl = DEFAULT_ACL_SUFFIX, suffixMeta = '.meta' } = {}) {
    this.suffixAcl = suffixAcl
    this.suffixMeta = suffixMeta
  }

  /**
   * Buffers and returns the contents of a given blob.
   * Whenever possible, prefer streaming via `createReadStream()`.
   *
   * @returns {Promise<object>}
   */
  async readBlob () {
    throw new Error('readBlob() must be implemented in subclass.')
  }

  async deleteContainer () {
    throw new Error('deleteContainer() must be implemented in subclass.')
  }

  async deleteResource () {
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
    if (resourceNames.indexOf(this.suffixMeta) > -1) {
      skipCount++
    }
    if (resourceNames.indexOf(this.suffixAcl) > -1) {
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
  async resource () {
    throw new Error('resource() must be implemented in subclass.')
  }
}

module.exports = {
  LdpStore
}
