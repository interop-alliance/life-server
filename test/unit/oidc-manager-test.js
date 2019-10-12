'use strict'

const path = require('path')
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

const { OidcManager } = require('../../lib/authentication/oidc-manager')
const SolidHost = require('../../lib/solid-host')

describe('OidcManager', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  describe('fromServerConfig()', () => {
    it('should error if no serverUri is provided in argv', () => {

    })

    it('should result in an initialized oidc object', () => {
      let serverUri = 'https://localhost:8443'
      let host = SolidHost.from({ serverUri })

      let dbPath = path.join(__dirname, '../resources/db')
      let saltRounds = 5
      let argv = {
        host,
        dbPath,
        saltRounds
      }

      let oidc = OidcManager.fromServerConfig(argv)

      expect(oidc.rs.defaults.query).to.be.true
      expect(oidc.clients.store.backend.path.endsWith('db/rp/clients'))
      expect(oidc.provider.issuer).to.equal(serverUri)
      expect(oidc.users.backend.path.endsWith('db/users'))
      expect(oidc.users.saltRounds).to.equal(saltRounds)
    })
  })

  describe('from()', () => {
    it('should create an OidcManager instance from config', () => {
      let providerUri = 'https://localhost:8443'
      let dbPath = './db/oidc'
      let saltRounds = 5
      let host = {}
      let authCallbackUri = providerUri + '/api/oidc/rp'
      let postLogoutUri = providerUri + '/goodbye'

      let options = {
        serverUri: providerUri,
        providerUri,
        dbPath,
        host,
        saltRounds,
        authCallbackUri,
        postLogoutUri
      }

      let oidc = OidcManager.from(options)

      expect(oidc.providerUri).to.equal(providerUri)
      expect(oidc.serverUri).to.equal(providerUri)
      expect(oidc.host).to.equal(host)
      expect(oidc.saltRounds).to.equal(saltRounds)
      expect(oidc.authCallbackUri).to.equal(authCallbackUri)
      expect(oidc.postLogoutUri).to.equal(postLogoutUri)

      let storePaths = oidc.storePaths
      expect(storePaths.providerStore.endsWith('oidc/op'))
      expect(storePaths.multiRpStore.endsWith('oidc/rp'))
      expect(storePaths.userStore.endsWith('oidc/users'))

      expect(oidc.rs).to.exist()
      expect(oidc.clients).to.exist()
      expect(oidc.users).to.exist()
      expect(oidc.provider).to.exist()
    })
  })

  describe('initMultiRpClient()', () => {
    it('should initialize a Multi RP Client Store instance', () => {
      let providerUri = 'https://localhost:8443'
      let authCallbackUri = providerUri + '/api/oidc/rp'
      let postLogoutUri = providerUri + '/goodbye'
      let dbPath = './db/oidc-mgr'

      let config = {
        serverUri: providerUri,
        providerUri,
        authCallbackUri,
        postLogoutUri,
        dbPath
      }

      let oidc = OidcManager.from(config)
      oidc.initMultiRpClient()

      let clientStore = oidc.clients
      expect(clientStore.store.backend.path.endsWith('oidc-mgr/rp/clients'))
      expect(clientStore).to.respondTo('registerClient')
    })
  })

  describe('initRs()', () => {
    it('should initialize a Resource Authenticator instance', () => {
      let serverUri = 'https://localhost:8443'
      let authCallbackUri = serverUri + '/api/oidc/rp'
      let postLogoutUri = serverUri + '/goodbye'

      let config = { serverUri, providerUri: serverUri, authCallbackUri, postLogoutUri }

      let oidc = OidcManager.from(config)
      oidc.initRs()

      expect(oidc.rs.defaults.query).to.be.true()
      expect(oidc.rs.defaults.realm).to.equal(serverUri)
      expect(oidc.rs).to.respondTo('authenticate')
    })
  })

  describe('initUserStore()', () => {
    it('should initialize a UserStore instance', () => {
      let dbPath = './db/oidc-mgr'
      let providerUri = 'https://localhost:8443'
      let authCallbackUri = providerUri + '/api/oidc/rp'
      let postLogoutUri = providerUri + '/goodbye'

      let config = {
        providerUri,
        authCallbackUri,
        postLogoutUri,
        saltRounds: 5,
        dbPath
      }

      let oidc = OidcManager.from(config)
      oidc.initUserStore()

      expect(oidc.users.backend.path.endsWith('oidc-mgr/users'))
      expect(oidc.users.saltRounds).to.equal(config.saltRounds)
    })
  })

  describe('initProvider()', () => {
    it('should initialize an OIDC Provider instance', () => {
      let providerUri = 'https://localhost:8443'
      let authCallbackUri = providerUri + '/api/oidc/rp'
      let postLogoutUri = providerUri + '/goodbye'

      let host = {
        authenticate: () => {},
        obtainConsent: () => {},
        logout: () => {}
      }
      let dbPath = './db/oidc-mgr'
      let config = { providerUri, host, dbPath, authCallbackUri, postLogoutUri }

      let oidc = OidcManager.from(config)

      let loadProviderConfig = sinon.spy(oidc, 'loadProviderConfig')

      oidc.initProvider()

      expect(oidc.provider.issuer).to.equal(providerUri)
      let storePath = oidc.provider.backend.path
      expect(storePath.endsWith('oidc-mgr/op')).to.be.true()
      expect(oidc.provider.host.authenticate).to.equal(host.authenticate)
      expect(loadProviderConfig).to.have.been.called()
    })
  })

  describe('providerConfigPath()', () => {
    it('should return the Provider config file path', () => {
      let providerUri = 'https://localhost:8443'
      let authCallbackUri = providerUri + '/api/oidc/rp'
      let postLogoutUri = providerUri + '/goodbye'
      let dbPath = './db/oidc-mgr'
      let config = { dbPath, providerUri, authCallbackUri, postLogoutUri }

      let oidc = OidcManager.from(config)

      let file = oidc.providerConfigPath()
      expect(file.endsWith('oidc-mgr/op/provider.json')).to.be.true()
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

      let webId = OidcManager.extractWebId(claims)

      expect(webId).to.equal(aliceWebId)
    })

    it('should use the sub claim if it contains an http* uri', () => {
      claims.sub = aliceWebId

      let webId = OidcManager.extractWebId(claims)

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
    const config = { providerUri, authCallbackUri, postLogoutUri }
    const oidc = OidcManager.from(config)

    it('should resolve with null webid with missing claims', () => {
      return oidc.webIdFromClaims(null)
        .then(webId => {
          expect(webId).to.be.null()
        })
    })

    it('should skip verifying preferred provider if webid and issuer match', () => {
      let claims = {
        iss: 'https://example.com',
        sub: 'https://example.com/profile#me'
      }

      return oidc.webIdFromClaims(claims)
        .then(webId => {
          expect(webId).to.equal(claims.sub)
        })
    })

    it('should verify provider if webid and issuer do not match', () => {
      let claims = {
        iss: 'https://provider.com',
        sub: 'https://example.com/profile#me'
      }

      nock('https://example.com')
        .options('/profile')
        .reply(204, 'No content', {
          'Link': '<https://provider.com>; rel="http://openid.net/specs/connect/1.0/issuer"'
        })

      return oidc.webIdFromClaims(claims)
        .then(webId => {
          expect(webId).to.equal(claims.sub)
        })
    })

    it('should throw an error if provider could not be verified', done => {
      let claims = {
        iss: 'https://provider.com',
        sub: 'https://example.com/profile#me'
      }

      nock('https://example.com')
        .options('/profile')
        .reply(204, 'No content', {
          'Link': '<https://another-provider.com>; rel="http://openid.net/specs/connect/1.0/issuer"'
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
      let webId = 'https://alice.example.com/profile#me'
      let issuer = 'https://alice.example.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.true()
    })

    it('should be false if webid is from different domain as issuer', () => {
      let webId = 'https://example.com/#me'
      let issuer = 'https://provider.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.false()
    })

    it('should be true if webid origin is subdomain of issuer', () => {
      let webId = 'https://alice.example.com/profile#me'
      let issuer = 'https://example.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.true()
    })

    it('should be false if webid and issuer protocols do not match', () => {
      let webId = 'http://example.com/#me'
      let issuer = 'https://example.com'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.false()
    })

    it('should be false if webid and issuer ports do not match', () => {
      let webId = 'https://example.com/#me'
      let issuer = 'https://example.com:8080'

      expect(OidcManager.domainMatches(issuer, webId)).to.be.false()
    })
  })

  describe('filterAudience', () => {
    const providerUri = 'https://example.com'
    const authCallbackUri = providerUri + '/api/oidc/rp'
    const postLogoutUri = providerUri + '/goodbye'
    const config = { providerUri, authCallbackUri, postLogoutUri }
    const oidc = OidcManager.from(config)

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
