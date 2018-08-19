'use strict'

const shortid = require('shortid')

// Note: no period or colon chars allowed in collection names
const DEFAULT_COLLECTIONS = []

class CollectionManager {
  constructor ({couch}) {
    this.couch = couch
  }

  async createDefaultCollections (userAccount) {
    return Promise.all(DEFAULT_COLLECTIONS.map(collection => {
      return this.createUserCollection(userAccount, collection)
    }))
  }

  /**
   *
   * @param userAccount {UserAccount}
   * @param collection {string}
   *
   * @returns {Promise<object>}
   */
  async createUserCollection (userAccount, collection) {
    const username = `${userAccount.username}.${collection}`
    const id = `org.couchdb.user:${username}`
    const password = shortid.generate()

    const users = this.couch.use('_users')
    const doc = { _id: id, name: username, password, roles: [], type: 'user' }

    try {
      await users.insert(doc)
    } catch (error) {
      console.error('Error creating a user collection:', error)
    }

    return { collection, username, password }
  }
}

module.exports = CollectionManager
