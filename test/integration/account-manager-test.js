'use strict'

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
chai.use(require('dirty-chai'))
chai.should()

const SolidHost = require('../../lib/solid-host')
const { AccountManager } = require('../../lib/account-mgmt/account-manager')
const { testAccountManagerOptions } = require('../utils')

const testAccountsDir = path.join(__dirname, '../resources/accounts')
const accountTemplatePath = path.join(__dirname, '../../default-templates/new-account')

let host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
  fs.removeSync(path.join(__dirname, '../resources/accounts/alice.localhost'))
})

afterEach(() => {
  fs.removeSync(path.join(__dirname, '../resources/accounts/alice.example.com'))
})

describe('AccountManager', () => {
  describe('accountExists()', () => {
    describe('in multi user mode', () => {
      const host = SolidHost.from({
        root: testAccountsDir,
        serverUri: 'https://localhost',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      it('resolves to true if a directory for the account exists in root', async () => {
        // Note: test/resources/accounts/tim.localhost/ exists in this repo
        const exists = await accountManager.accountExists('tim')
        expect(exists).to.be.true()
      })

      it('resolves to false if a directory for the account does not exist', async () => {
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

      it('resolves to false if root .acl does not exist in root storage', () => {
        host.root = testAccountsDir
        host.multiuser = false

        const options = testAccountManagerOptions(host)
        const accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.be.false()
          })
      })
    })
  })

  describe('provisionAccountStorage()', () => {
    it('should create an account directory', async () => {
      host.root = testAccountsDir
      host.multiuser = true

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

      const accountDir = path.join(testAccountsDir, '/alice.example.com')

      await accountManager.provisionAccountStorage(userAccount)
      const found = await accountManager.accountExists('alice')
      expect(found).to.be.true()
      const profile = fs.readFileSync(path.join(accountDir, '/web'), 'utf8')
      expect(profile).to.include('"Alice Q."')

      const rootAcl = fs.readFileSync(path.join(accountDir, '.acl'), 'utf8')
      expect(rootAcl).to.include('<mailto:alice@')
      expect(rootAcl).to.include('<https://alice.example.com/web#id>')
    })
  })
})
