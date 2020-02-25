'use strict'

const fs = require('fs-extra')
const path = require('path')
const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect
chai.should()

const { OidcManager } = require('../../lib/authentication/oidc-manager')
const SolidHost = require('../../lib/solid-host')
const { testStorage } = require('../utils')

const dbPath = path.resolve(__dirname, '../resources/temp/db/oidc')
const serverUri = 'https://example.com'

describe('OidcManager (integration tests)', () => {
  beforeEach(() => {
    fs.removeSync(dbPath)
    fs.mkdirpSync(dbPath)
    fs.mkdirpSync(path.join(dbPath, 'op'))
  })

  after(() => {
    fs.removeSync(dbPath)
  })

  describe('from()', () => {
    it('should result in an oidc instance', () => {
      const serverUri = 'https://localhost:8443'
      const host = SolidHost.from({ serverUri })

      const argv = { host }
      const storage = testStorage(host)

      const oidc = OidcManager.from(argv, storage)

      expect(oidc.serverUri).to.equal(serverUri)
      expect(oidc.providerUri).to.equal(serverUri)
      expect(oidc.authCallbackUri).to.equal(serverUri + '/api/oidc/rp')
      expect(oidc.postLogoutUri).to.equal(serverUri + '/goodbye')
      expect(oidc.storage).to.equal(storage)
    })
  })

  describe('initialize()', () => {
    it.skip('should initialize stores and provider config', async () => {
      const serverUri = 'https://localhost:8443'
      const host = SolidHost.from({ serverUri })

      const argv = { host }
      const storage = testStorage(host)
      const oidc = OidcManager.from(argv, storage)
      await oidc.initialize()
      expect(oidc.rs).to.exist()
      expect(oidc.clients).to.exist()
      expect(oidc.users).to.exist()
      expect(oidc.provider).to.exist()

      expect(oidc.rs.defaults.query).to.be.true()
      expect(oidc.clients.store.backend.dir.endsWith('db/oidc/rp/clients'))
      expect(oidc.provider.issuer).to.equal(serverUri)
    })
  })

  describe('loadProviderConfig()', () => {
    const host = SolidHost.from({ serverUri })

    it('it should return minimal config if no saved config present', async () => {
      const config = {
        authCallbackUri: serverUri + '/api/oidc/rp',
        postLogoutUri: serverUri + '/goodbye',
        host,
        serverUri,
        providerUri: serverUri
      }
      const storage = testStorage(host)
      const oidc = OidcManager.from(config, storage)

      const providerConfig = await oidc.loadProviderConfig()
      expect(providerConfig.issuer).to.equal(serverUri)
      expect(providerConfig.keys).to.not.exist()
    })

    it('should attempt to load previously saved provider config', async () => {
      const config = {
        authCallbackUri: serverUri + '/api/oidc/rp',
        postLogoutUri: serverUri + '/goodbye',
        host,
        serverUri,
        providerUri: serverUri
      }
      const storage = testStorage(host, dbPath)
      const oidc = OidcManager.from(config, storage)

      await oidc.initialize()
      const providerConfig = await oidc.loadProviderConfig()
      expect(providerConfig.issuer).to.equal(serverUri)
      expect(providerConfig.authorization_endpoint).to.exist()
      expect(providerConfig.keys).to.exist()
    }).timeout(20000)
  })
})
