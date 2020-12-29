'use strict'

const provider = require('../../src/authentication/preferred-provider')

const nock = require('nock')
const chai = require('chai')
// const sinon = require('sinon')
chai.use(require('dirty-chai'))
// const sinonChai = require('sinon-chai')
// chai.use(sinonChai)
const expect = chai.expect
const serverUri = 'https://example.com'

const sampleProfileSrc = require('../resources/sample-webid-profile')

describe('preferred-provider.js', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  describe('discoverProviderFor()', () => {
    const webId = 'https://example.com/#id'

    it('should extract and validate the provider uri from link rel header', () => {
      nock(serverUri)
        .options('/')
        .reply(204, 'No content', {
          Link: '<https://example.com>; rel="http://openid.net/specs/connect/1.0/issuer"'
        })

      return provider.discoverProviderFor(webId)
        .then(providerUri => {
          expect(providerUri).to.equal('https://example.com')
        })
    })

    it('should drop the path from extracted provider uri', () => {
      nock(serverUri)
        .options('/')
        .reply(204, 'No content', {
          Link: '<https://example.com/>; rel="http://openid.net/specs/connect/1.0/issuer"'
        })

      return provider.discoverProviderFor(webId)
        .then(providerUri => {
          expect(providerUri).to.equal('https://example.com')
        })
    })

    it('should extract and validate the provider uri from the webid profile', () => {
      nock(serverUri)
        .options('/')
        .reply(204, 'No content')

      nock(serverUri)
        .get('/')
        .reply(200, sampleProfileSrc, {
          'Content-Type': 'text/turtle'
        })

      return provider.discoverProviderFor(webId)
        .then(providerUri => {
          expect(providerUri).to.equal('https://provider.com')
        })
    })

    it('should throw an error if webid is reachable but no provider uri found', done => {
      nock(serverUri)
        .options('/')
        .reply(204, 'No content') // no provider uri in OPTIONS headers

      nock(serverUri)
        .get('/')
        .reply(200, '', {
          'Content-Type': 'text/turtle' // no provider triple in the profile
        })

      provider.discoverProviderFor(webId)
        .catch(err => {
          expect(err.message).to.match(/OIDC issuer not advertised for https:\/\/example.com\/#id/)
          done()
        })
    })

    it('should throw an error if web id is unreachable', async () => {
      nock(serverUri)
        .get('/').reply(404)
        .options('/').reply(404)

      let error
      try {
        await provider.discoverProviderFor(webId)
      } catch (thrownError) {
        error = thrownError
        expect(error.statusCode).to.equal(400)
        expect(error.message)
          .to.equal('Could not reach Web ID https://example.com/#id to discover provider')
      }
      expect(error).to.exist()
    })
  })

  describe('validateProviderUri()', () => {
    it('throws a 400 on an invalid provider uri', done => {
      try {
        provider.validateProviderUri('invalid provider uri')
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        expect(error.message).to.include('not a valid URI')
        done()
      }
    })
  })

  describe('providerExists()', () => {
    it('should return the provider uri if oidc config exists there', () => {
      nock(serverUri)
        .head('/.well-known/openid-configuration')
        .reply(200)

      return provider.providerExists(serverUri + '/whatever')
        .then(result => {
          expect(result).to.equal(serverUri)
        })
    })

    it('should return null if no oidc capability exists', () => {
      nock(serverUri)
        .head('/.well-known/openid-configuration')
        .reply(404)

      return provider.providerExists(serverUri + '/whatever')
        .then(result => {
          expect(result).to.be.null()
        })
    })
  })

  describe('preferredProviderFor()', () => {
    it('should return the provider uri if oidc provider exists at webid', () => {
      nock('https://example.com')
        .head('/.well-known/openid-configuration')
        .reply(200)

      const webId = 'https://example.com/profile#id'

      return provider.preferredProviderFor(webId)
        .then(providerUri => {
          expect(providerUri).to.equal('https://example.com')
        })
    })

    it('should discover preferred provider if no oidc capability at webid', () => {
      nock('https://example.com')
        .head('/.well-known/openid-configuration')
        .reply(404)

      nock('https://example.com')
        .options('/profile')
        .reply(204, 'No content', {
          Link: '<https://provider.com>; rel="http://openid.net/specs/connect/1.0/issuer"'
        })

      const webId = 'https://example.com/profile#id'

      return provider.preferredProviderFor(webId)
        .then(providerUri => {
          expect(providerUri).to.equal('https://provider.com')
        })
    })
  })
})
