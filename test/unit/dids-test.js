'use strict'

const chai = require('chai')
const { expect } = chai
chai.should()

const { generateDid } = require('../../lib/dids')

describe('dids utils', () => {
  describe('generateDid()', () => {
    it('should generate a DID document for a url', async () => {
      const { didDocument, didKeys } = await generateDid({
        url: 'https://alice.provider.com'
      })

      expect(didDocument.id).to.equal('did:web:alice.provider.com')
      expect(didDocument).to.have.property('authentication')

      expect(Object.keys(didKeys).length).to.equal(4)
    })
  })
})
