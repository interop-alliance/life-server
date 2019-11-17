'use strict'
const chai = require('chai')
const { expect } = chai
chai.should()

const { OIDCClientStore } = require('../../lib/authentication/client-store')
const OIDCRelyingParty = require('@interop-alliance/oidc-rp')

const storeBasePath = '../resources/client-store/'
const storeOptions = {
  path: storeBasePath
}

let store

before(async () => {
  store = new OIDCClientStore(storeOptions)
  return store.backend.createCollection('clients')
})

describe('ClientStore', () => {
  it('should write and delete clients', async () => {
    const issuer = 'https://oidc.example.com'
    const client = new OIDCRelyingParty({ provider: { url: issuer } })

    const storedClient = await store.put(client)
    expect(storedClient).to.equal(client, 'store.put() should return the stored client')

    return store.del(client) // cleanup
  })
})
