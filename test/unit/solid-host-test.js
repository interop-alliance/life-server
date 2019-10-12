'use strict'

const expect = require('chai').expect

const SolidHost = require('../../lib/solid-host')
const defaults = require('../../config/defaults')

describe('SolidHost', () => {
  describe('from()', () => {
    it('should init with port, serverUri and hostname', () => {
      let config = {
        port: 3000,
        serverUri: 'https://localhost:3000'
      }
      let host = SolidHost.from(config)

      expect(host.port).to.equal(3000)
      expect(host.serverUri).to.equal('https://localhost:3000')
      expect(host.hostname).to.equal('localhost')
    })

    it('should init to default port and serverUri values', () => {
      let host = SolidHost.from({})
      expect(host.port).to.equal(defaults.port)
      expect(host.serverUri).to.equal(defaults.serverUri)
    })
  })

  describe('accountUriFor()', () => {
    it('should compose an account uri for an account name', () => {
      let config = {
        serverUri: 'https://test.local'
      }
      let host = SolidHost.from(config)

      expect(host.accountUriFor('alice')).to.equal('https://alice.test.local')
    })

    it('should throw an error if no account name is passed in', () => {
      let host = SolidHost.from()
      expect(() => { host.accountUriFor() }).to.throw(TypeError)
    })
  })

  describe('allowsSessionFor()', () => {
    let host
    before(() => {
      host = SolidHost.from({
        serverUri: 'https://test.local'
      })
    })

    it('should allow an empty userId and origin', () => {
      expect(host.allowsSessionFor('', '')).to.be.true
    })

    it('should allow a userId with empty origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/profile/card#me', '')).to.be.true
    })

    it('should allow a userId with the user subdomain as origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/profile/card#me', 'https://user.test.local')).to.be.true
    })

    it('should disallow a userId with another subdomain as origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/profile/card#me', 'https://other.test.local')).to.be.false
    })

    it('should allow a userId with the server domain as origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/profile/card#me', 'https://test.local')).to.be.true
    })

    it('should disallow a userId from a different domain', () => {
      expect(host.allowsSessionFor('https://user.test.local/profile/card#me', 'https://other.remote')).to.be.false
    })
  })

  describe('cookieDomain getter', () => {
    it('should return null for single-part domains (localhost)', () => {
      let host = SolidHost.from({
        serverUri: 'https://localhost:8443'
      })

      expect(host.cookieDomain).to.be.null
    })

    it('should return a cookie domain for multi-part domains', () => {
      let host = SolidHost.from({
        serverUri: 'https://example.com:8443'
      })

      expect(host.cookieDomain).to.equal('.example.com')
    })
  })

  describe('authEndpoint getter', () => {
    it('should return an /authorize url object', () => {
      let host = SolidHost.from({
        serverUri: 'https://localhost:8443'
      })

      let authUrl = host.authEndpoint

      expect(authUrl.host).to.equal('localhost:8443')
      expect(authUrl.path).to.equal('/authorize')
    })
  })
})
