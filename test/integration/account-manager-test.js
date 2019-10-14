'use strict'

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
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

      it('resolves to true if a directory for the account exists in root', () => {
        // Note: test/resources/accounts/tim.localhost/ exists in this repo
        return accountManager.accountExists('tim')
          .then(exists => {
            expect(exists).to.be.true
          })
      })

      it('resolves to false if a directory for the account does not exist', async () => {
        // Note: test/resources/accounts/alice.localhost/ does NOT exist
        const exists = await accountManager.accountExists('alice')
        expect(exists).to.be.false
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
            expect(exists).to.be.true
          })
      })

      it('resolves to false if root .acl does not exist in root storage', () => {
        host.root = testAccountsDir
        host.multiuser = false

        const options = testAccountManagerOptions(host)
        let accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.be.false
          })
      })
    })
  })

  describe('createAccountStorage()', () => {
    it('should create an account directory', () => {
      host.root = testAccountsDir
      host.multiuser = true

      const options = testAccountManagerOptions(host)
      let accountManager = AccountManager.from({
        accountTemplatePath, ...options
      })

      let userData = {
        username: 'alice',
        email: 'alice@example.com',
        name: 'Alice Q.'
      }
      let userAccount = accountManager.userAccountFrom(userData)

      let accountDir = accountManager.accountDirFor('alice')

      return accountManager.createAccountStorage(userAccount)
        .then(() => {
          return accountManager.accountExists('alice')
        })
        .then(found => {
          expect(found).to.be.true
        })
        .then(() => {
          let profile = fs.readFileSync(path.join(accountDir, '/profile/card'), 'utf8')
          expect(profile).to.include('"Alice Q."')

          let rootAcl = fs.readFileSync(path.join(accountDir, '.acl'), 'utf8')
          expect(rootAcl).to.include('<mailto:alice@')
          expect(rootAcl).to.include('<https://alice.example.com/profile/card#me>')
        })
    })
  })
})
