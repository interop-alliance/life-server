'use strict'

const path = require('path')
const fs = require('fs-extra')
const { CollectionManager } = require('./collection-manager')
const couchClient = require('nano')
const { URL } = require('url')
const { FlexDocStore } = require('flex-docstore')
const { UserCredentialStore } = require('../authentication/user-credential-store')
const LegacyResourceMapper = require('./ldp-backend-fs/legacy-resource-mapper')
const { LdpFileStore } = require('./ldp-backend-fs/ldp-file-store')

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
   * @param host {ServerHost}
   * @param ldpStore {LdpStore}
   * @param users {UserCredentialStore} User credential store backend
   * @param op {object} OpenID Connect Provider store hashmap (stores OP config,
   *   client dynamic registrations, tokens, auth codes, etc)
   * @param rp {FlexDocStore} OpenID Connect multi-provider RP client store
   * @param accountStorage {LdpStore} User Storage Account store. (Same as the ldp
   *   data store, for the moment.)
   * @param collectionManager {CollectionManager}
   * @param transactions {FlexDocStore} Auth transactions store
   */
  constructor ({
    host, ldpStore, users, op, rp, accountStorage,
    collectionManager, transactions
  }) {
    this.host = host
    this.ldpStore = ldpStore
    this.users = users
    this.op = op
    this.rp = rp
    this.accountStorage = accountStorage
    this.collectionManager = collectionManager
    this.transactions = transactions
  }

  /**
   * Factory method, returns an initialized StorageManager instance.
   *
   * @param host {ServerHost}
   * @param couchConfig {object} CouchDB config hashmap from argv
   * @param dbPath {string} Path to db directory (contains database of user
   *   credentials, OIDC provider storage, and so on).
   * @param [saltRounds] {number} Number of bcrypt password salt rounds
   *
   * @returns {StorageManager}
   */
  static from ({ host, couchConfig, dbPath = '', saltRounds }) {
    const mapper = LegacyResourceMapper.from({ host })
    const ldpStore = new LdpFileStore({ host, mapper })

    // User credentials store. Used for authentication, email account recovery
    const users = UserCredentialStore.from({
      saltRounds,
      backend: FlexDocStore.using(
        'files', { dir: path.resolve(dbPath, 'users') }
      )
    })

    const oidcPath = path.resolve(dbPath, 'oidc')
    // OpenID Connect Provider storage
    const op = {
      codes: FlexDocStore.using('memory'),
      clients: FlexDocStore.using('memory'),
      tokens: FlexDocStore.using('memory'),
      refresh: FlexDocStore.using('memory'),
      config: FlexDocStore.using('files',
        { dir: path.join(oidcPath, 'op', 'provider') })
    }
    // OpenID Connect multi-provider RP client store
    // const rp = FlexDocStore.using(
    //   'files', { dir: path.resolve(oidcPath, 'rp', 'clients') }
    // )
    const rp = FlexDocStore.using('memory')

    return new StorageManager({
      host,
      users,
      op,
      rp,
      ldpStore,
      accountStorage: ldpStore,
      collectionManager: initCollectionManager({ couchConfig }),
      transactions: FlexDocStore.using('memory')
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

function escapeDidForFilename ({ did }) {
  if (!did) {
    throw new Error('Missing DID.')
  }
  return did.replace(/:/g, '-')
}

async function storeDidKeys ({ didKeys, did, dir }) {
  const { keyStore, exportKeys } = require('./key-storage')

  await fs.ensureDir(dir)
  await keyStore({ dir: dir }).put(escapeDidForFilename({ did }),
    await exportKeys(didKeys))
}

module.exports = {
  StorageManager,
  initCollectionManager,
  storeDidKeys,
  escapeDidForFilename
}
