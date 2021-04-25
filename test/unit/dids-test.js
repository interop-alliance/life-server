'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const { expect } = chai
chai.should()

const { generateDid, didForWebId } = require('../../src/accounts/dids')

describe('dids utils', () => {
  describe('generateDid()', () => {
    it('should generate a DID document for a url', async () => {
      const { didDocument, keyPairs, methodFor } = await generateDid({
        url: 'https://alice.provider.com'
      })

      expect(didDocument.id).to.equal('did:web:alice.provider.com')
      expect(didDocument).to.have.property('authentication')

      expect(keyPairs.size).to.equal(5)
      expect(methodFor).to.exist()
      const keyAgreementKey = methodFor({ purpose: 'keyAgreement' })
      expect(keyAgreementKey.type).to.equal('X25519KeyAgreementKey2020')
    })
  })

  describe('didForWebId()', () => {
    it('should return a DID for a Web ID url', async () => {
      const webId = 'https://alice.provider.com/web#id'

      const did = didForWebId({ webId })
      expect(did).to.equal('did:web:alice.provider.com')
    })
  })
})
