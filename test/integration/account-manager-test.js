'use strict'

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
chai.use(require('dirty-chai'))
chai.should()

const ServerHost = require('../../lib/server-host')
const { AccountManager } = require('../../lib/account-mgmt/account-manager')
const { testAccountManagerOptions } = require('../utils')

const testAccountsDir = path.join(__dirname, '../resources/accounts')
const accountTemplatePath = path.join(__dirname, '../../default-templates/new-account')

let host

beforeEach(() => {
  host = ServerHost.from({
    serverUri: 'https://example.com',
    root: testAccountsDir,
    multiuser: true
  })
  fs.removeSync(path.join(__dirname, '../resources/accounts/alice.localhost'))
})

afterEach(() => {
  fs.removeSync(path.join(__dirname, '../resources/accounts/alice.example.com'))
})

describe('AccountManager', () => {
  describe('accountExists()', () => {
    describe('in multi user mode', () => {
      const host = ServerHost.from({
        root: testAccountsDir,
        serverUri: 'https://localhost',
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
        expect(exists).to.be.false()
      })
    })

    describe('in single user mode', () => {
      it('resolves to true if root .acl exists in root storage', () => {
        host.root = path.join(testAccountsDir, 'tim.localhost')
        host.multiuser = false

        const options = testAccountManagerOptions(host)
        const accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.be.true()
          })
      })

      it('resolves to false if root .acl does not exist', async () => {
        host.multiuser = false

        const options = testAccountManagerOptions(host)
        const accountManager = AccountManager.from(options)

        const exists = await accountManager.accountExists()
        expect(exists).to.be.false()
      })
    })
  })

  describe('provisionAccountStorage()', () => {
    it('should create an account directory', async () => {
      const options = testAccountManagerOptions(host)
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
      const profile = fs.readFileSync(path.join(accountDir, '/web'), 'utf8')
      expect(profile).to.include('"Alice Q."')

      const rootAcl = fs.readFileSync(path.join(accountDir, '.acl'), 'utf8')
      expect(rootAcl).to.include('<mailto:alice@')
      expect(rootAcl).to.include('<https://alice.example.com/web#id>')
    })
  })

  describe('provisionAccountDid()', () => {
    it('should create an account DID Document', async () => {
      const options = testAccountManagerOptions(host)
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

      const didKeysPath = path.join(testAccountsDir, 'alice.example.com',
        'vault', 'keys', `${didDoc.id}.keys.json`)
      const keys = JSON.parse(await fs.readFile(didKeysPath, 'utf8'))
      for (const keyId of Object.keys(keys)) {
        expect(keys[keyId].type).to.equal('Ed25519VerificationKey2018')
      }
    })
  })
})
