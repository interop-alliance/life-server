const OIDCRelyingParty = require('@interop-alliance/oidc-rp')
const COLLECTION_NAME = 'clients'

class OIDCClientStore {
  /**
   * @constructor
   *
   * @param [options={}] {Object}
   *
   * @param [options.collectionName='clients'] {string}
   *
   * @param [options.backend] {KVPFileStore} Either pass in a backend store
   * @param [options.path] {string} Or initialize the store from path.
   */
  constructor (options = {}) {
    this.collectionName = options.collectionName || COLLECTION_NAME

    this.backend = options.backend

    this.backend.serialize = (client) => { return client.serialize() }
    this.backend.deserialize = (data) => {
      let result
      try {
        result = JSON.parse(data)
      } catch (error) {
        console.log(`Error parsing JSON at '${this.backend.path}', ` +
          `collection '${this.collectionName}': `, error)
      }
      return result
    }
  }

  del (client) {
    if (!this.backend) {
      return Promise.reject(new Error('Client store not configured'))
    }
    if (!client) {
      return Promise.reject(new Error('Cannot delete null client'))
    }
    const issuer = encodeURIComponent(client.provider.url)
    return this.backend.del(this.collectionName, issuer)
  }

  put (client) {
    if (!this.backend) {
      return Promise.reject(new Error('Client store not configured'))
    }
    if (!client) {
      return Promise.reject(new Error('Cannot store null client'))
    }
    const issuer = encodeURIComponent(client.provider.url)

    return this.backend.put(this.collectionName, issuer, client)
      .then(() => {
        return client
      })
  }

  get (issuer) {
    if (!this.backend) {
      return Promise.reject(new Error('Client store not configured'))
    }
    issuer = encodeURIComponent(issuer)
    return this.backend.get(this.collectionName, issuer)
      .then(result => {
        if (result) {
          return OIDCRelyingParty.from(result)
        }
        return result
      })
      .catch(error => {
        console.error('Error in clientStore.get() while loading a RelyingParty:',
          error)
      })
  }
}

module.exports = {
  OIDCClientStore
}
