'use strict'

const bcrypt = require('bcryptjs')

const DEFAULT_SALT_ROUNDS = 10

class UserCredentialStore {
  /**
   * @param [saltRounds] {number} Number of `bcryptjs` password hash
   *   salt rounds.
   * @see https://www.npmjs.com/package/bcryptjs
   *
   * @param [backend] {FlexDocStore} Optional Key/Value file store
   *   (will be initialized if not passed in).
   */
  constructor ({ backend, saltRounds = DEFAULT_SALT_ROUNDS }) {
    this.backend = backend
    this.saltRounds = saltRounds
  }

  /**
   * Factory method, constructs a UserCredentialStore instance from passed in
   * options.
   * Usage:
   *
   *   ```
   *   const options = {
   *     path: './db/users',
   *     saltRounds: 10
   *   }
   *   const store = UserCredentialStore.from(options)
   *   ```
   *
   * @param backendType {string} 'files' / 'memory'
   *
   * @param [saltRounds] {number} Number of `bcrypt` password hash
   *   salt rounds.
   *
   * @return {UserCredentialStore}
   */
  static from ({ saltRounds = DEFAULT_SALT_ROUNDS, backend }) {
    return new UserCredentialStore({ saltRounds, backend })
  }

  /**
   * Generates a salted password hash, saves user credentials to the 'users'
   * collection.
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
    if (user.email) {
      await this.saveAliasUserRecord(user.email, user.id)
    }
    return user
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
      const error = new TypeError('No user id provided to user store')
      error.status = 400
      throw error
    }
  }

  validatePassword (password) {
    if (!password) {
      const error = new TypeError('No password provided')
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
    return this.backend.put(user.id, user)
  }

  /**
   * Permanently deletes a user credentials entry
   *
   * @param user {UserAccount}
   *
   * @return {Promise}
   */
  async deleteUser (user) {
    if (user.email) {
      await this.backend.remove(user.email)
    }
    return this.backend.remove(user.id)
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
      '@alias': toId
    }

    return this.backend.put(fromId, aliasRecord)
  }

  /**
   * Loads and returns a user object for a given id.
   *
   * @param userId {string} WebID or email
   *
   * @return {Promise<object>} User info, parsed from a JSON string
   */
  async findUser (userId) {
    const user = await this.backend.get(userId)

    if (user && user['@alias']) {
      // this is an alias record, fetch the user it points to
      return this.findUser(user['@alias'])
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
