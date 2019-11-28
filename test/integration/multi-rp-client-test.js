const chai = require('chai')
const sinon = require('sinon')
const { expect } = chai
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const { MultiRpClient } = require('../../lib/authentication/multi-rp-client')
const OIDCRelyingParty = require('@interop-alliance/oidc-rp')
const { FlexDocStore } = require('flex-docstore')

const storeBasePath = '../resources/client-store/'
const store = FlexDocStore.using(
  'files',
  {
    dir: storeBasePath,
    modelClass: OIDCRelyingParty
  })

describe('MultiRpClient', () => {
  describe('constructor', () => {
    it('should initialize an instance', () => {
      const localIssuer = 'https://oidc.example.com'
      const localConfig = {
        issuer: localIssuer
      }

      const options = {
        store,
        localConfig
      }
      const multiClient = new MultiRpClient(options)
      expect(multiClient.store.backend.dir).to.equal(storeBasePath)
      expect(multiClient.localConfig).to.equal(localConfig)
      expect(multiClient.localIssuer).to.equal(localIssuer)
    })
  })

  describe('registrationConfigFor()', () => {
    it('should return a registration for a given config', () => {
      const issuer = 'https://oidc.example.com'
      const localConfig = {
        issuer: issuer,
        redirect_uri: 'https://localhost:8443/rp'
      }
      const multiClient = new MultiRpClient({ localConfig })
      const { registration } = multiClient.registrationConfigFor(issuer)
      expect(registration.client_name)
      expect(registration.issuer).to.equal(issuer)
      expect(registration.redirect_uris)
        .to.eql(['https://localhost:8443/rp/https%3A%2F%2Foidc.example.com'])
    })
  })

  describe('clientForIssuer()', () => {
    it('should load a client from store', async () => {
      const issuer = 'https://oidc.example.com'
      const store = {}

      store.get = sinon.stub()
        .resolves(new OIDCRelyingParty({ provider: { url: issuer } }))

      const client = new OIDCRelyingParty({ provider: { url: issuer } })

      const multiClient = new MultiRpClient({ store })
      const retrievedClient = await multiClient.clientForIssuer(issuer)
      expect(retrievedClient.issuer).to.equal(client.issuer)
      expect(store.get.calledWith(issuer))
    })
  })

  describe('redirectUriForIssuer()', () => {
    it('should default issuer redirect_uri from local config', () => {
      const localRedirectUri = 'https://oidc.example.com/rp'
      const localConfig = {
        redirect_uri: localRedirectUri
      }
      const multiClient = new MultiRpClient({ store, localConfig })
      const otherIssuer = 'https://issuer.com'
      const issuerRedirectUri = multiClient.redirectUriForIssuer(otherIssuer)
      expect(issuerRedirectUri).to.equal('https://oidc.example.com/rp/https%3A%2F%2Fissuer.com')
    })
  })
})
