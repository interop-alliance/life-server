'use strict'

const chai = require('chai')
const expect = chai.expect
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
chai.should()

const TokenService = require('../../src/accounts/token-service')

describe('TokenService', () => {
  describe('constructor()', () => {
    it('should init with an empty tokens store', () => {
      const service = new TokenService()

      expect(service.tokens).to.exist()
    })
  })

  describe('generate()', () => {
    it('should generate a new token and return a token key', () => {
      const service = new TokenService()

      const token = service.generate('test')
      const value = service.tokens.test[token]

      expect(token).to.exist()
      expect(value).to.have.property('exp')
    })
  })

  describe('verify()', () => {
    it('should return false for expired tokens', () => {
      const service = new TokenService()

      const token = service.generate('foo')

      service.tokens.foo[token].exp = new Date(Date.now() - 1000)

      expect(service.verify('foo', token)).to.be.false()
    })

    it('should return false for non-existent tokens', () => {
      const service = new TokenService()

      service.generate('foo') // to have generated the domain
      const token = 'invalid token 123'

      expect(service.verify('foo', token)).to.be.false()
    })

    it('should return the token value if token not expired', () => {
      const service = new TokenService()

      const token = service.generate('foo')

      expect(service.verify('foo', token)).to.be.ok()
    })

    it('should throw error if invalid domain', () => {
      const service = new TokenService()

      const token = service.generate('foo')

      expect(() => service.verify('bar', token)).to.throw()
    })
  })

  describe('remove()', () => {
    it('should remove a generated token from the service', () => {
      const service = new TokenService()

      const token = service.generate('bar')

      service.remove('bar', token)

      expect(service.tokens.bar[token]).to.not.exist()
    })

    it('should throw an error if invalid domain', () => {
      const service = new TokenService()

      const token = service.generate('foo')

      expect(() => service.remove('bar', token)).to.throw()
    })
  })
})
