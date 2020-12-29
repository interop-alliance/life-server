'use strict'
const chai = require('chai')
const { expect } = chai
chai.use(require('dirty-chai'))

const ServerHost = require('../../src/server/server-host')
const defaults = require('../../src/defaults')

describe('ServerHost', () => {
  describe('from()', () => {
    it('should init with port, serverUri and hostname', () => {
      const config = {
        port: 3000,
        serverUri: 'https://localhost:3000'
      }
      const host = ServerHost.from(config)

      expect(host.port).to.equal(3000)
      expect(host.serverUri).to.equal('https://localhost:3000')
      expect(host.hostname).to.equal('localhost')
      expect(host.features).to.eql({})
    })

    it('should init to default port and serverUri values', () => {
      const host = ServerHost.from({})
      expect(host.port).to.equal(defaults.port)
      expect(host.serverUri).to.equal(defaults.serverUri)
    })
  })

  describe('accountUriFor()', () => {
    it('should compose an account uri for an account name', () => {
      const config = {
        serverUri: 'https://test.local'
      }
      const host = ServerHost.from(config)

      expect(host.accountUriFor('alice')).to.equal('https://alice.test.local')
    })

    it('should throw an error if no account name is passed in', () => {
      const host = ServerHost.from()
      expect(() => { host.accountUriFor() }).to.throw(TypeError)
    })
  })

  describe('allowsSessionFor()', () => {
    let host
    before(() => {
      host = ServerHost.from({
        serverUri: 'https://test.local'
      })
    })

    it('should allow an empty userId and origin', () => {
      expect(host.allowsSessionFor('', '')).to.be.true()
    })

    it('should allow a userId with empty origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/web#id', '')).to.be.true()
    })

    it('should allow a userId with the user subdomain as origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/web#id', 'https://user.test.local')).to.be.true()
    })

    it('should disallow a userId with another subdomain as origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/web#id', 'https://other.test.local')).to.be.false()
    })

    it('should allow a userId with the server domain as origin', () => {
      expect(host.allowsSessionFor('https://user.test.local/web#id', 'https://test.local')).to.be.true()
    })

    it('should disallow a userId from a different domain', () => {
      expect(host.allowsSessionFor('https://user.test.local/web#id', 'https://other.remote')).to.be.false()
    })
  })

  describe('cookieDomain getter', () => {
    it('should return null for single-part domains (localhost)', () => {
      const host = ServerHost.from({
        serverUri: 'https://localhost:8443'
      })

      expect(host.cookieDomain).to.not.be.ok()
    })

    it('should return a cookie domain for multi-part domains', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com:8443'
      })

      expect(host.cookieDomain).to.equal('.example.com')
    })
  })

  describe('authEndpoint getter', () => {
    it('should return an /authorize url object', () => {
      const host = ServerHost.from({
        serverUri: 'https://localhost:8443'
      })

      const authUrl = host.authEndpoint

      expect(authUrl.host).to.equal('localhost:8443')
      expect(authUrl.pathname).to.equal('/authorize')
    })
  })

  describe('parseTargetUrl()', () => {
    it('should extract a fully-qualified url from an Express request', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })

      const req = {
        protocol: 'https:',
        get: (host) => 'example.com',
        baseUrl: '/',
        path: '/resource1',
        query: { sort: 'desc' }
      }

      expect(host.parseTargetUrl(req)).to.equal('https://example.com/resource1?sort=desc')
    })
  })
})
