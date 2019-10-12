'use strict'

// const Url = require('url')

class StorageManager {
  constructor ({ host, store }) {
    this.host = host
    this.store = store
  }

  /**
   * Returns the storage backend for a given request target.
   *
   * @param target {LdpTarget}
   * @returns {LdpStore}
   */
  storeForTarget ({ target }) {
    // if (target.isGraph || target.isContainer) {
    //   return this.graphStore
    // }

    return this.store
  }

  accountStore () {
    return this.store
  }

  /**
   * @param target {LdpTarget}
   * @returns {boolean}
   */
  isRemote (target) {
    // FIXME (need to deal with subdomains etc)
    // const { serverUri } = this.host
    // const { url } = target
    // return Url.parse(url).host.includes(Url.parse(serverUri).host)
    return false
  }
}

module.exports = {
  StorageManager
}
