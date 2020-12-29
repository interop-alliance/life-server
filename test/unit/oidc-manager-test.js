'use strict'

const chai = require('chai')
const nock = require('nock')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const { OidcManager } = require('../../src/authentication/oidc-manager')
const ServerHost = require('../../src/server/server-host')
const { testStorage } = require('../utils')
const host = ServerHost.from({ serverUri: 'https://localhost:8443' })

describe('OidcManager', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  describe('from()', () => {
    it('should create an OidcManager instance from config', () => {
      const providerUri = 'https://localhost:8443'
      const dbPath = './db/oidc'
      const authCallbackUri = providerUri + '/api/oidc/rp'
      const postLogoutUri = providerUri + '/goodbye'

      const options = {
        serverUri: providerUri,
        providerUri,
        host,
        authCallbackUri,
        postLogoutUri
      }
      const storage = testStorage(host, dbPath)

      const oidc = OidcManager.from(options, storage)

      expect(oidc.providerUri).to.equal(providerUri)
      expect(oidc.serverUri).to.equal(providerUri)
      expect(oidc.authCallbackUri).to.equal(authCallbackUri)
      expect(oidc.postLogoutUri).to.equal(postLogoutUri)
    })
  })

  describe('initMultiRpClient()', () => {
    it('should initialize a Multi RP Client Store instance', () => {
      const providerUri = 'https://localhost:8443'
      const authCallbackUri = providerUri + '/api/oidc/rp'
      const postLogoutUri = providerUri + '/goodbye'
      const dbPath = './db/oidc-mgr'

      const config = {
        serverUri: providerUri,
        providerUri,
        authCallbackUri,
        postLogoutUri,
        host
      }
      const storage = testStorage(host, dbPath)
      const oidc = OidcManager.from(config, storage)
      oidc.initMultiRpClient()

      const clientStore = oidc.clients
      expect(clientStore.store).to.exist()
      expect(clientStore).to.respondTo('registerClient')
    })
  })

  describe('initRs()', () => {
    it('should initialize a Resource Authenticator instance', () => {
      const serverUri = 'https://localhost:8443'
      const authCallbackUri = serverUri + '/api/oidc/rp'
      const postLogoutUri = serverUri + '/goodbye'

      const config = {
        serverUri, providerUri: serverUri, authCallbackUri, postLogoutUri, host
      }
      const storage = testStorage(host)

      const oidc = OidcManager.from(config, storage)
      oidc.initRs()

      expect(oidc.rs.defaults.query).to.be.true()
      expect(oidc.rs.defaults.realm).to.equal(serverUri)
      expect(oidc.rs).to.respondTo('authenticate')
    })
  })

  describe('initProvider()', () => {
    it('should initialize an OIDC Provider instance', async () => {
      const providerUri = 'https://localhost:8443'
      const authCallbackUri = providerUri + '/api/oidc/rp'
      const postLogoutUri = providerUri + '/goodbye'

      const dbPath = './db/oidc-mgr'
      const config = { providerUri, authCallbackUri, postLogoutUri, host }

      const storage = testStorage(host, dbPath)
      const oidc = OidcManager.from(config, storage)

      const loadProviderConfig = sinon.spy(oidc, 'loadProviderConfig')

      await oidc.initProvider()

      expect(oidc.provider.issuer).to.equal(providerUri)
      expect(loadProviderConfig).to.have.been.called()
    })
  })

  describe('extractWebId()', () => {
    const aliceWebId = 'https://alice.example.com/#me'
    let claims

    beforeEach(() => {
      claims = {
        iss: 'https://example.com',
        sub: 'abcd'
      }
    })

    it('should throw an error for null claims', () => {
      expect(() => OidcManager.extractWebId(null))
        .to.throw(/Cannot extract Web ID from missing claims/)
    })

    it('should throw an error if issuer claim is not present', () => {
      delete claims.iss

      expect(() => OidcManager.extractWebId(claims))
        .to.throw(/Cannot extract Web ID - missing issuer claim/)
    })

    it('should first look in the webid claim', () => {
      claims.webid = aliceWebId

      const webId = OidcManager.extractWebId(claims)

      expect(webId).to.equal(aliceWebId)
    })

    it('should use the sub claim if it contains an http* uri', () => {
      claims.sub = aliceWebId

      const webId = OidcManager.extractWebId(claims)

      expect(webId).to.equal(aliceWebId)
    })

    it('should throw an error if no webid claim and sub claim is invalid uri', () => {
      claims.sub = 'invalid uri'

      expect(() => OidcManager.extractWebId(claims))
        .to.throw(/Cannot extract Web ID - subject claim is not a valid URI/)
    })

    it('should throw if none of the above claims are found', () => {
      delete claims.sub

      expect(() => OidcManager.extractWebId(claims))
        .to.throw(/Cannot extract Web ID - no webid or subject claim/)
    })
  })

  describe('webIdFromClaims', () => {
    const providerUri = 'https://example.com'
    const authCallbackUri = providerUri + '/api/oidc/rp'
    const postLogoutUri = providerUri + '/goodbye'
    const config = { providerUri, authCallbackUri, postLogoutUri, host }
    const storage = testStorage(host)
    const oidc = OidcManager.from(config, storage)

    it('should resolve with null webid with missing claims', () => {
      return oidc.webIdFromClaims(null)
        .then(webId => {
          expect(webId).to.be.null()
        })
    })

    it('should skip verifying preferred provider if webid and issuer match', () => {
      const claims = {
        iss: 'https://example.com',
        sub: 'https://example.com/profile#me'
      }

      return oidc.webIdFromClaims(claims)
        .then(webId => {
          expect(webId).to.equal(claims.sub)
        })
    })

    it('should verify provider if webid and issuer do not match', () => {
      const claims = {
        iss: 'https://provider.com',
        sub: 'https://example.com/profile#me'
      }

      nock('https://example.com')
        .options('/profile')
        .reply(204, 'No content', {
          Link: '<https://provider.com>; rel="http://openid.net/specs/connect/1.0/issuer"'
        })

      return oidc.webIdFromClaims(claims)
        .then(webId => {
          expect(webId).to.equal(claims.sub)
        })
    })

    it('should throw an error if provider could not be verified', done => {
      const claims = {
        iss: 'https://provider.com',
        sub: 'https://example.com/profile#me'
      }

      nock('https://example.com')
        .options('/profile')
        .reply(204, 'No content', {
          Link: '<https://another-provider.com>; rel="http://openid.net/specs/connect/1.0/issuer"'
        })

      oidc.webIdFromClaims(claims)
        .catch(err => {
          expect(err).to.match(/Preferred provider for Web ID https:\/\/example.com\/profile#me does not match token issuer https:\/\/provider.com/)
          done()
        })
    })
  })

  describe('domainMatches', () => {
    it('should be true if webid came from same origin as issuer', () => {
      const webId = 'https://alice.example.com/profile#me'
      const issuer = 'https://alice.example.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.true()
    })

    it('should be false if webid is from different domain as issuer', () => {
      const webId = 'https://example.com/#me'
      const issuer = 'https://provider.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.false()
    })

    it('should be true if webid origin is subdomain of issuer', () => {
      const webId = 'https://alice.example.com/profile#me'
      const issuer = 'https://example.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.true()
    })

    it('should be false if webid and issuer protocols do not match', () => {
      const webId = 'http://example.com/#me'
      const issuer = 'https://example.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.false()
    })

    it('should be false if webid and issuer ports do not match', () => {
      const webId = 'https://example.com/#me'
      const issuer = 'https://example.com:8080'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.false()
    })
  })

  describe('filterAudience', () => {
    const providerUri = 'https://example.com'
    const authCallbackUri = providerUri + '/api/oidc/rp'
    const postLogoutUri = providerUri + '/goodbye'
    const host = { serverUri: 'https://example.com' }
    const config = { providerUri, authCallbackUri, postLogoutUri, host, dbPath: '' }
    const storage = testStorage(host)
    const oidc = OidcManager.from(config, storage)

    it('should be false if no audience passed in', () => {
      expect(oidc.filterAudience(undefined)).to.be.false()
    })

    it('should be true if audience origin equals server uri', () => {
      expect(oidc.filterAudience('https://example.com/test')).to.be.true()
    })

    it('should be true if server uri is one of the audience matches', () => {
      expect(oidc.filterAudience(['https://example.com/test', 'https://other.com']))
        .to.be.true()
    })

    it('should be true if audience is a subdomain of server uri', () => {
      expect(oidc.filterAudience('https://alice.example.com/profile#me'))
        .to.be.true()
    })

    it('should be false if audience is a different domain than server', () => {
      expect(oidc.filterAudience('https://other.com')).to.be.false()
    })
  })
})
