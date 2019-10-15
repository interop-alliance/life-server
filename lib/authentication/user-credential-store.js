'use strict'

const KVPFileStore = require('kvplus-files')
const bcrypt = require('bcryptjs')

const DEFAULT_SALT_ROUNDS = 10

class UserCredentialStore {
  /**
   * @constructor
   *
   * @param [options={}] {Object} Options hashmap
   * @param [options.path] {string} Directory path where the various collections
   *   (users etc) will be stored.
   *
   * @param [options.saltRounds] {number} Number of `bcryptjs` password hash
   *   salt rounds.
   * @see https://www.npmjs.com/package/bcryptjs
   *
   * @param [options.backend] {KVPFileStore} Optional Key/Value file store
   *   (will be initialized if not passed in).
   * @see https://github.com/solid/kvplus-files
   */
  constructor (options) {
    this.backend = options.backend
    this.saltRounds = options.saltRounds
  }

  /**
   * Factory method, constructs a UserCredentialStore instance from passed in options.
   * Usage:
   *
   *   ```
   *   let options = {
   *     path: './db/users',
   *     saltRounds: 10
   *   }
   *   let store = UserCredentialStore.from(options)
   *   ```
   *
   * @param options {Object} Options hashmap
   *
   * @param options.path {string} Directory path where the various collections
   *   (users etc) will be stored. Used to initialize a backend.
   *
   * @param [options.saltRounds] {number} Number of `bcrypt` password hash
   *   salt rounds.
   *
   * @return {UserCredentialStore}
   */
  static from (options) {
    options.saltRounds = options.saltRounds || DEFAULT_SALT_ROUNDS

    let storeOptions = UserCredentialStore.backendOptionsFor(options.path)
    options.backend = new KVPFileStore(storeOptions)

    return new UserCredentialStore(options)
  }

  /**
   * Constructs and returns options for initializing a default KVPFileStore
   * instance.
   *
   * @param path {string} Directory path where the various collections
   *   (users etc) will be stored. Used to initialize a backend if it's not
   *   explicitly passed in.
   *
   * @return {Object}
   */
  static backendOptionsFor (path) {
    return {
      path,
      collections: ['users', 'users-by-email']
    }
  }

  /**
   * Creates and returns an fs-safe filename key from an email.
   *
   * @param email {string|null}
   *
   * @return {string|null}
   */
  static normalizeEmailKey (email) {
    if (!email) { return null }

    return encodeURIComponent(email)
  }

  /**
   * Creates and returns an fs-safe filename key from an id string (which can
   * be an http URI).
   *
   * @param id {string|null}
   *
   * @return {string|null}
   */
  static normalizeIdKey (id) {
    if (!id) { return null }

    return encodeURIComponent(id)
  }

  /**
   * Initializes the backend store's collections (if using a file-system based
   * backend, this creates directories for each collection).
   */
  initCollections () {
    this.backend.initCollections()
  }

  /**
   * Generates a salted password hash, saves user credentials to the 'users'
   * collection, and makes an index entry into the 'users-by-email' collection
   * if applicable.
   *
   * @param user {UserAccount} User account currently being created
   * @param password {string} User's login password
   *
   * @throws {TypeError} HTTP 400 errors if required parameters are missing.
   *
   * @return {Promise<object>} Resolves to stored user object hashmap
   */
  async createUser (user, password) {
    this.validateUser(user)
    this.validatePassword(password)
    user.hashedPassword = await this.hashPassword(password)
    await this.saveUser(user)
    return this.saveUserByEmail(user)
  }

  /**
   * Updates (overwrites) a user record with the new password.
   *
   * @param user {UserAccount}
   * @param password {string}
   *
   * @return {Promise}
   */
  async updatePassword (user, password) {
    this.validateUser(user)
    this.validatePassword(password)
    user.hashedPassword = await this.hashPassword(password)
    return this.saveUser(user)
  }

  validateUser (user) {
    if (!user || !user.id) {
      let error = new TypeError('No user id provided to user store')
      error.status = 400
      throw error
    }
  }

  validatePassword (password) {
    if (!password) {
      let error = new TypeError('No password provided')
      error.status = 400
      throw error
    }
  }

  /**
   * Saves a serialized user object to the 'users' collection.
   *
   * @param user {UserAccount}
   *
   * @return {Promise}
   */
  async saveUser (user) {
    let userKey = UserCredentialStore.normalizeIdKey(user.id)

    if (user.localAccountId) {
      return this.saveAliasUserRecord(user.localAccountId, user.id)
    }

    return this.backend.put('users', userKey, user)
  }
  /**
   * Permanently deletes the files of a user
   *
   * @param user {UserAccount}
   *
   * @return {Promise}
   */

  async deleteUser (user) {
    const userKey = UserCredentialStore.normalizeIdKey(user.id)
    let deletedEmail
    if (user.email) {
      const emailKey = UserCredentialStore.normalizeEmailKey(user.email)
      deletedEmail = this.backend.del('users-by-email', emailKey)
    } else {
      deletedEmail = Promise.reject(new Error('No email given'))
    }
    const deletedUser = this.backend.del('users', userKey)
    return Promise.all([deletedEmail, deletedUser])
  }

  /**
   * Saves an "alias" user object, used for linking local account IDs to
   * external Web IDs.
   *
   * @param fromId {string}
   * @param toId {string}
   *
   * @returns {Promise}
   */
  async saveAliasUserRecord (fromId, toId) {
    const aliasRecord = {
      link: toId
    }

    const aliasKey = UserCredentialStore.normalizeIdKey(fromId)

    return this.backend.put('users', aliasKey, aliasRecord)
  }

  /**
   * Creates an entry for the user id in the 'users-by-email' index, if
   * applicable.
   *
   * @param user {UserAccount}
   *
   * @return {Promise}
   */
  async saveUserByEmail (user) {
    if (!user.email) {
      return
    }
    const userByEmail = { id: user.id }
    const key = UserCredentialStore.normalizeEmailKey(user.email)
    return this.backend.put('users-by-email', key, userByEmail)
  }

  /**
   * Loads and returns a user object for a given id.
   *
   * @param userId {string}
   *
   * @return {Promise<object>} User info, parsed from a JSON string
   */
  async findUser (userId) {
    let userKey = UserCredentialStore.normalizeIdKey(userId)

    const user = await this.backend.get('users', userKey)

    if (user && user.link) {
      // this is an alias record, fetch the user it points to
      return this.findUser(user.link)
    }

    return user
  }

  /**
   * Creates and returns a salted password hash, for storage with the user
   * record.
   *
   * @see https://www.npmjs.com/package/bcrypt
   *
   * @param plaintextPassword {string}
   *
   * @throws {Error}
   *
   * @return {Promise<string>} Combined salt and password hash, bcrypt style
   */
  async hashPassword (plaintextPassword) {
    return new Promise((resolve, reject) => {
      bcrypt.hash(plaintextPassword, this.saltRounds, (err, hashedPassword) => {
        if (err) { return reject(err) }
        resolve(hashedPassword)
      })
    })
  }

  /**
   * Returns the user object if the plaintext password matches the stored hash,
   * and returns a `null` if there is no match.
   *
   * @param user {UserAccount}
   * @param user.hashedPassword {string} Created by a previous call to
   *   `hashPassword()` and stored in the user object.
   *
   * @param plaintextPassword {string} For example, submitted by a user from a
   *   login form.
   *
   * @return {Promise<UserAccount|null>}
   */
  async matchPassword (user, plaintextPassword) {
    return new Promise((resolve, reject) => {
      bcrypt.compare(plaintextPassword, user.hashedPassword, (err, res) => {
        if (err) { return reject(err) }
        if (res) { // password matches
          return resolve(user)
        }
        return resolve(null)
      })
    })
  }
}

module.exports = {
  UserCredentialStore,
  DEFAULT_SALT_ROUNDS
}
