'use strict'

const { CollectionManager } = require('./data-storage/collection-manager')
const couchClient = require('nano')
const { URL } = require('url')
const LegacyResourceMapper = require('./data-storage/ldp-backend-fs/legacy-resource-mapper')
const { LdpFileStore } = require('./data-storage/ldp-backend-fs/ldp-file-store')

// const Url = require('url')

/**
 * General purpose manager of various storage backends used in the server
 * (LDP file store, user account stores, identity provider config stores, etc).
 *
 * Usage (in request handlers, to get an LDP resource store):
 *
 * ```
 * const { storage } = req.app.locals
 *
 * const ldpStore = storage.storeForTarget({ target })
 * ```
 */
class StorageManager {
  /**
   * @param host {SolidHost}
   * @param ldpStore {LdpStore}
   * @param accountStorage {LdpStore} User Storage Account store. (Same as the ldp
   *   data store, for the moment.)
   * @param collectionManager {CollectionManager}
   * @param dbPath {string} Path to db directory (contains database of user
   *   credentials, OIDC provider storage, and so on).
   * @param saltRounds {number} Number of bcrypt password salt rounds
   */
  constructor ({ host, ldpStore, accountStorage, collectionManager, dbPath, saltRounds }) {
    this.host = host
    this.ldpStore = ldpStore
    this.accountStorage = accountStorage
    this.collectionManager = collectionManager
    this.dbPath = dbPath
    this.saltRounds = saltRounds
  }

  /**
   * Factory method, returns an initialized StorageManager instance.
   *
   * @param host {SolidHost}
   * @param couchConfig {object} CouchDB config hashmap from argv
   * @param dbPath {string} Path to db directory (contains database of user
   *   credentials, OIDC provider storage, and so on).
   * @param saltRounds {number} Number of bcrypt password salt rounds
   *
   * @returns {StorageManager}
   */
  static from ({ host, couchConfig, dbPath, saltRounds }) {
    const mapper = LegacyResourceMapper.from({ host })
    const ldpStore = new LdpFileStore({ host, mapper })

    return new StorageManager({
      host,
      ldpStore,
      accountStorage: ldpStore,
      collectionManager: initCollectionManager({ couchConfig })
    })
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

    return this.ldpStore
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

/**
 * @param couchConfig {object} CouchDB config hashmap from argv
 *
 * @returns {CollectionManager}
 */
function initCollectionManager ({ couchConfig }) {
  if (!couchConfig) { return }

  const couchUrl = new URL(couchConfig.url)
  couchUrl.username = couchConfig.username
  couchUrl.password = couchConfig.password
  const couch = couchClient(couchUrl.toString())

  return new CollectionManager({ couch })
}

module.exports = {
  StorageManager,
  initCollectionManager
}
