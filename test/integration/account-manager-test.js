'use strict'

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
chai.use(require('dirty-chai'))
chai.should()

const vc = require('@digitalcredentials/vc')
const ServerHost = require('../../src/server/server-host')
const { AccountManager } = require('../../src/accounts/account-manager')

const { testAccountManagerOptions } = require('../utils')
const testAccountsDir = path.join(__dirname, '..', 'resources', 'accounts')
const accountTemplatePath = path.join(__dirname, '..', '..', 'src',
  'accounts', 'account-templates', 'new-account')

let sHost, mHost

beforeEach(() => {
  mHost = ServerHost.from({
    serverUri: 'https://example.com',
    root: testAccountsDir,
    multiuser: true
  })

  sHost = ServerHost.from({
    serverUri: 'https://example.com',
    root: path.join(testAccountsDir, 'alice.localhost'),
    multiuser: false
  })

  fs.removeSync(path.join(__dirname, '..', 'resources', 'accounts', 'alice.localhost'))
})

afterEach(() => {
  fs.removeSync(path.join(__dirname, '..', 'resources', 'accounts', 'alice.example.com'))
  fs.removeSync(path.join(__dirname, '..', 'resources', 'accounts', 'new.localhost'))
  fs.removeSync(path.join(__dirname, '..', 'resources', 'accounts', 'alice.localhost'))
})

describe('AccountManager', () => {
  describe('accountExists()', () => {
    describe('in multi user mode', () => {
      const host = ServerHost.from({
        root: testAccountsDir,
        serverUri: 'https://localhost:7070',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      it('resolves to true if account directory exists', async () => {
        // Note: test/resources/accounts/tim.localhost/ exists in this repo
        const exists = await accountManager.accountExists('tim')
        expect(exists).to.be.true()
      })

      it('resolves to false if account directory does not exist', async () => {
        // Note: test/resources/accounts/alice.localhost/ does NOT exist
        const exists = await accountManager.accountExists('alice')
        expect(exists).to.equal(false)
      })
    })

    describe('in single user mode', () => {
      it('resolves to true if root .acl exists in root storage', async () => {
        const host = ServerHost.from({
          root: path.join(testAccountsDir, 'tim.localhost'),
          serverUri: 'https://localhost:7070',
          multiuser: false
        })
        const options = testAccountManagerOptions(host)
        const accountManager = AccountManager.from(options)

        const exists = await accountManager.accountExists()
        expect(exists).to.be.true()
      })

      it('resolves to false if root .acl does not exist', async () => {
        const options = testAccountManagerOptions(sHost)
        const accountManager = AccountManager.from(options)

        const exists = await accountManager.accountExists()
        expect(exists).to.be.equal(false)
      })
    })
  })

  describe('provisionAccountStorage()', () => {
    it('(multi) should create an account directory', async () => {
      const options = testAccountManagerOptions(mHost)
      const accountManager = AccountManager.from({
        accountTemplatePath, ...options
      })
      const userData = {
        username: 'alice',
        email: 'alice@example.com',
        name: 'Alice Q.'
      }
      const userAccount = accountManager.userAccountFrom(userData)

      await accountManager.provisionAccountStorage(userAccount)

      const accountDir = path.join(testAccountsDir, 'alice.example.com')
      const found = await accountManager.accountExists('alice')
      expect(found).to.be.true()
      const profile = fs.readFileSync(path.join(accountDir, 'web'), 'utf8')
      expect(profile).to.include('"Alice Q."')

      const rootAcl = fs.readFileSync(path.join(accountDir, '.acl'), 'utf8')
      expect(rootAcl).to.include('<mailto:alice@')
      expect(rootAcl).to.include('<https://alice.example.com/web#id>')
    })

    it('(single) should create an account directory', async () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        root: path.join(testAccountsDir, 'new.localhost'),
        multiuser: false
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from({
        accountTemplatePath, ...options
      })
      const userData = {
        username: 'alice',
        email: 'alice@example.com',
        name: 'Alice Q.',
        webId: 'https://example.com/web#id'
      }
      const userAccount = accountManager.userAccountFrom(userData)

      await accountManager.provisionAccountStorage(userAccount)

      const accountDir = path.join(testAccountsDir, 'new.localhost')
      const found = await accountManager.accountExists('alice')
      expect(found).to.be.true()
      const profile = fs.readFileSync(path.join(accountDir, 'web'), 'utf8')
      expect(profile).to.include('"Alice Q."')

      const rootAcl = fs.readFileSync(path.join(accountDir, '.acl'), 'utf8')
      expect(rootAcl).to.include('<mailto:alice@')
      expect(rootAcl).to.include('<https://example.com/web#id>')
    })
  })

  describe('provisionAccountDid()', () => {
    it('(multi) should create an account DID Document', async () => {
      const options = testAccountManagerOptions(mHost)
      const accountManager = AccountManager.from({
        accountTemplatePath, ...options
      })
      const userData = { username: 'alice' }
      const userAccount = accountManager.userAccountFrom(userData)

      await accountManager.provisionAccountDid({ userAccount })

      const didDocPath = path.join(testAccountsDir, 'alice.example.com',
        '.well-known', 'did.json')

      const didDoc = JSON.parse(await fs.readFile(didDocPath, 'utf8'))

      expect(didDoc.id).to.equal('did:web:alice.example.com')

      const keyPairs = await accountManager.loadKeys({
        accountUri: accountManager.accountUriFor('alice'), did: didDoc.id
      })

      expect(keyPairs).to.exist()
      expect(keyPairs.size > 0).to.be.true()

      keyPairs.forEach(keyPair => {
        expect(keyPair.controller).to.equal('did:web:alice.example.com')
      })
    })

    it('(single) should create an account DID Document', async () => {
      const options = testAccountManagerOptions(sHost)
      const accountManager = AccountManager.from({
        accountTemplatePath, ...options
      })
      const userData = {
        username: 'alice',
        webId: 'https://example.com/web#id'
      }
      const userAccount = accountManager.userAccountFrom(userData)

      await accountManager.provisionAccountDid({ userAccount })

      const didDocPath = path.join(testAccountsDir, 'alice.localhost',
        '.well-known', 'did.json')

      const didDoc = JSON.parse(await fs.readFile(didDocPath, 'utf8'))

      expect(didDoc.id).to.equal('did:web:example.com')

      const keyPairs = await accountManager.loadKeys({
        accountUri: accountManager.accountUriFor('alice'), did: didDoc.id
      })

      expect(keyPairs).to.exist()
      expect(keyPairs.size > 0).to.be.true()

      keyPairs.forEach(keyPair => {
        expect(keyPair.controller).to.equal('did:web:example.com')
      })
    })
  })

  describe('signingKey', () => {
    it('(multi) should fetch a verification suite and loader', async () => {
      const options = testAccountManagerOptions(mHost)
      const accountManager = AccountManager.from({
        accountTemplatePath, ...options
      })
      const userData = { username: 'alice' }
      const userAccount = accountManager.userAccountFrom(userData)

      await accountManager.provisionAccountDid({ userAccount })

      const { webId } = userAccount

      const { did, suite, documentLoader } = await accountManager.signingKey({
        webId, purpose: 'authentication'
      })

      expect(did).to.equal('did:web:alice.example.com')
      expect(suite.type).to.equal('Ed25519Signature2020')
      const { document } = await documentLoader(
        'https://w3id.org/security/suites/ed25519-2020/v1'
      )
      expect(document['@context'].id).to.equal('@id')

      // Ensure it works to sign a presentation
      const presentation = vc.createPresentation({ holder: did })

      const vp = await vc.signPresentation(
        { presentation, suite, challenge: '1234', domain: 'https://example.com', documentLoader }
      )

      expect(vp.type.includes('VerifiablePresentation')).to.be.true()
      expect(vp.holder).to.equal(did)
      expect(vp.proof.type).to.equal('Ed25519Signature2020')
      // console.log(vp)
    })

    it('(single) should fetch a verification suite and loader', async () => {
      const options = testAccountManagerOptions(sHost)
      const accountManager = AccountManager.from({
        accountTemplatePath, ...options
      })
      const userData = {
        username: 'alice',
        webId: 'https://example.com/web#id'
      }
      const userAccount = accountManager.userAccountFrom(userData)

      await accountManager.provisionAccountDid({ userAccount })

      const { webId } = userAccount

      const { did, suite, documentLoader } = await accountManager.signingKey({
        webId, purpose: 'authentication'
      })

      expect(did).to.equal('did:web:example.com')
      expect(suite.type).to.equal('Ed25519Signature2020')
      const { document } = await documentLoader(
        'https://w3id.org/security/suites/ed25519-2020/v1'
      )
      expect(document['@context'].id).to.equal('@id')

      // Ensure it works to sign a presentation
      const presentation = vc.createPresentation({ holder: did })

      const vp = await vc.signPresentation({
        presentation,
        suite,
        challenge: '1234',
        domain: 'https://example.com',
        documentLoader
      })

      expect(vp.type.includes('VerifiablePresentation')).to.be.true()
      expect(vp.holder).to.equal(did)
      expect(vp.proof.type).to.equal('Ed25519Signature2020')
      // console.log(vp)
    })
  })
})
