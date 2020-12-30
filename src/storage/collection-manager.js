'use strict'

const shortid = require('shortid')

// Note: no period or colon chars allowed in collection names
const DEFAULT_COLLECTIONS = ['contacts']

class CollectionManager {
  /**
   * @param [couch] {Nano} CouchDB client instance
   */
  constructor ({ couch }) {
    this.couch = couch
  }

  async createDefaultCollections (userAccount) {
    if (!this.couch) { return }

    return Promise
      .all(DEFAULT_COLLECTIONS.map(collection => {
        return this.createUserCollection(userAccount, collection)
      }))
      .then(credentialsList => {
        return this.createCollectionCredentialsDoc(userAccount, credentialsList)
      })
  }

  /**
   *
   * @param userAccount {UserAccount}
   * @param collectionName {string}
   *
   * @returns {Promise<object>}
   */
  async createUserCollection (userAccount, collectionName) {
    const username = `${userAccount.username}.${collectionName}`
    const id = `org.couchdb.user:${username}`
    const password = shortid.generate()

    const users = this.couch.use('_users')
    const userDoc = { _id: id, name: username, password, roles: [], type: 'user' }
    // Name of the user's db that Couch automatically creates
    const dbName = 'userdb-' + Buffer.from(username, 'utf8').toString('hex')

    try {
      const result = await users.insert(userDoc)
      console.log('Created user collection:', result)
    } catch (error) {
      console.error('Error creating a user collection:', error)
    }

    return { collectionName, username, password, dbName }
  }

  /**
   * @param userAccount {UserAccount}
   * @param credentialsList {Array<object>} List of collection credentials
   *   objects (see return statement of createUserCollection())
   */
  async createCollectionCredentialsDoc (userAccount, credentialsList) {
    const metaDb = this.couch.use('ls-meta')

    const credentialsMap = {}
    for (const credential of credentialsList) {
      credentialsMap[credential.collectionName] = credential
    }

    const doc = {
      _id: `user-collections-${userAccount.username}`,
      ...credentialsMap
    }

    try {
      await metaDb.insert(doc)
    } catch (error) {
      console.error('Error saving collections credentials:', error)
    }
  }
}

module.exports = {
  CollectionManager
}
