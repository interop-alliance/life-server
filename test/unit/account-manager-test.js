'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.use(require('dirty-chai'))
chai.should()

const ServerHost = require('../../src/server-host')
const { AccountManager, isValidUsername } = require('../../src/account-mgmt/account-manager')
const UserAccount = require('../../src/account-mgmt/user-account')
const TokenService = require('../../src/account-mgmt/token-service')
const { testAccountManagerOptions } = require('../utils')

var host

beforeEach(() => {
  host = ServerHost.from({ serverUri: 'https://example.com' })
})

describe('AccountManager', () => {
  describe('from()', () => {
    it('should init with passed in options', () => {
      host.multiuser = true
      const config = {
        host,
        storage: {},
        authMethod: 'oidc',
        emailService: {},
        tokenService: {}
      }

      const mgr = AccountManager.from(config)
      expect(mgr.host).to.equal(config.host)
      expect(mgr.authMethod).to.equal(config.authMethod)
      expect(mgr.storage).to.equal(config.storage)
      expect(mgr.multiuser).to.equal(host.multiuser)
      expect(mgr.emailService).to.equal(config.emailService)
      expect(mgr.tokenService).to.equal(config.tokenService)
    })

    it('should error if no host param is passed in', () => {
      expect(() => { AccountManager.from() })
        .to.throw(/AccountManager requires a host instance/)
    })
  })

  describe('accountUriFor', () => {
    it('should compose account uri for an account in multi user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://localhost',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const mgr = AccountManager.from(options)

      const webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://alice.localhost')
    })

    it('should compose account uri for an account in single user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://localhost',
        multiuser: false
      })
      const options = testAccountManagerOptions(host)
      const mgr = AccountManager.from(options)

      const webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://localhost')
    })
  })

  describe('accountWebIdFor()', () => {
    it('should compose a web id uri for an account in multi user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://localhost',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const mgr = AccountManager.from(options)
      const webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://alice.localhost/web#id')
    })

    it('should compose a web id uri for an account in single user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://localhost',
        multiuser: false
      })
      const options = testAccountManagerOptions(host)
      const mgr = AccountManager.from(options)
      const webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://localhost/web#id')
    })
  })

  describe('userAccountFrom()', () => {
    describe('in multi user mode', () => {
      let options, accountManager, host

      beforeEach(() => {
        host = ServerHost.from({
          serverUri: 'https://example.com',
          multiuser: true
        })
        options = testAccountManagerOptions(host)
        accountManager = AccountManager.from(options)
      })

      it('should throw an error if no username is passed', () => {
        expect(() => {
          accountManager.userAccountFrom({})
        }).to.throw(/Username or web id is required/)
      })

      it('should init webId from param if no username is passed', () => {
        const userData = { webId: 'https://example.com' }
        const newAccount = accountManager.userAccountFrom(userData)
        expect(newAccount.webId).to.equal(userData.webId)
      })

      it('should derive the local account id from username, for external webid', () => {
        const userData = {
          externalWebId: 'https://alice.external.com/profile#me',
          username: 'user1'
        }

        const newAccount = accountManager.userAccountFrom(userData)

        expect(newAccount.username).to.equal('user1')
        expect(newAccount.webId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.externalWebId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.localAccountId).to.equal('user1.example.com/web#id')
      })

      it('should use the external web id as username if no username given', () => {
        const userData = {
          externalWebId: 'https://alice.external.com/profile#me'
        }

        const newAccount = accountManager.userAccountFrom(userData)

        expect(newAccount.username).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.webId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.externalWebId).to.equal('https://alice.external.com/profile#me')
      })
    })

    describe('in single user mode', () => {
      let options, accountManager, host

      beforeEach(() => {
        host = ServerHost.from({
          serverUri: 'https://example.com',
          multiuser: false
        })
        options = testAccountManagerOptions(host)
        accountManager = AccountManager.from(options)
      })

      it('should not throw an error if no username is passed', () => {
        expect(() => {
          accountManager.userAccountFrom({})
        }).to.not.throw(Error)
      })
    })
  })

  describe('rootAclFor()', () => {
    it('should return the server root .acl in single user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: false
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      const userAccount = UserAccount.from({ username: 'alice' })

      const rootAclUri = accountManager.rootAclFor(userAccount)

      expect(rootAclUri).to.equal('https://example.com/.acl')
    })

    it('should return the profile root .acl in multi user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      const userAccount = UserAccount.from({ username: 'alice' })

      const rootAclUri = accountManager.rootAclFor(userAccount)

      expect(rootAclUri).to.equal('https://alice.example.com/.acl')
    })
  })

  describe('loadAccountRecoveryEmail()', () => {
    it('parses and returns the agent mailto from the root acl', async () => {
      const userAccount = UserAccount.from({
        username: 'alice', email: 'alice@example.com'
      })
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      accountManager.storage.users.backend.get = sinon.stub().resolves(userAccount)

      const recoveryEmail = await accountManager.loadAccountRecoveryEmail(userAccount)
      expect(recoveryEmail).to.equal('alice@example.com')
    })

    it('should return undefined when agent mailto is missing', async () => {
      const userAccount = UserAccount.from({ username: 'alice' })

      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)
      accountManager.storage.users.backend.get = sinon.stub().resolves({})

      const recoveryEmail = await accountManager.loadAccountRecoveryEmail(userAccount)
      expect(recoveryEmail).to.be.undefined()
    })
  })

  describe('passwordResetUrl()', () => {
    it('should return a token reset validation url', () => {
      const tokenService = new TokenService()
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const options = testAccountManagerOptions(host, { tokenService })
      const accountManager = AccountManager.from(options)

      const returnToUrl = 'https://example.com/resource'
      const token = '123'

      const resetUrl = accountManager.passwordResetUrl(token, returnToUrl)

      const expectedUri = 'https://example.com/account/password/change?' +
        'token=123&returnToUrl=' + returnToUrl

      expect(resetUrl).to.equal(expectedUri)
    })
  })

  describe('generateDeleteToken()', () => {
    it('should generate and store an expiring delete token', () => {
      const tokenService = new TokenService()
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const options = testAccountManagerOptions(host, { tokenService })
      const accountManager = AccountManager.from(options)

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }

      const token = accountManager.generateDeleteToken(userAccount)

      const tokenValue = accountManager.tokenService
        .verify('delete-account', token)

      expect(tokenValue.webId).to.equal(aliceWebId)
      expect(tokenValue).to.have.property('exp')
    })
  })

  describe('generateResetToken()', () => {
    it('should generate and store an expiring reset token', () => {
      const tokenService = new TokenService()
      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })
      const options = testAccountManagerOptions(host, { tokenService })
      const accountManager = AccountManager.from(options)

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }

      const token = accountManager.generateResetToken(userAccount)

      const tokenValue = accountManager.tokenService.verify('reset-password', token)

      expect(tokenValue.webId).to.equal(aliceWebId)
      expect(tokenValue).to.have.property('exp')
    })
  })

  describe('sendPasswordResetEmail()', () => {
    it('should compose and send a password reset email', async () => {
      const resetToken = '1234'
      const tokenService = {
        generate: sinon.stub().returns(resetToken)
      }

      const emailService = {
        sendWithTemplate: sinon.stub().resolves()
      }

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      const returnToUrl = 'https://example.com/resource'

      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })
      const options = testAccountManagerOptions(host, { tokenService, emailService })
      const accountManager = AccountManager.from(options)

      accountManager.passwordResetUrl = sinon.stub().returns('reset url')

      const expectedEmailData = {
        to: 'alice@example.com',
        webId: aliceWebId,
        resetUrl: 'reset url'
      }

      await accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
      expect(accountManager.passwordResetUrl)
        .to.have.been.calledWith(resetToken, returnToUrl)
      expect(emailService.sendWithTemplate)
        .to.have.been.calledWith('reset-password', expectedEmailData)
    })

    it('should reject if no email service is set up', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      const returnToUrl = 'https://example.com/resource'
      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
        .catch(error => {
          expect(error.message).to.equal('Email service is not set up')
          done()
        })
    })

    it('should reject if no user email is provided', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }
      const returnToUrl = 'https://example.com/resource'
      const emailService = {}
      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })
      const options = testAccountManagerOptions(host, { emailService })
      const accountManager = AccountManager.from(options)

      accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
        .catch(error => {
          expect(error.message).to.equal('Account recovery email has not been provided')
          done()
        })
    })
  })

  describe('sendDeleteAccountEmail()', () => {
    it('should compose and send a delete account email', async () => {
      const deleteToken = '1234'
      const tokenService = {
        generate: sinon.stub().returns(deleteToken)
      }

      const emailService = {
        sendWithTemplate: sinon.stub().resolves()
      }

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }

      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })
      const options = testAccountManagerOptions(host, { tokenService, emailService })
      const accountManager = AccountManager.from(options)

      accountManager.getAccountDeleteUrl = sinon.stub().returns('delete account url')

      const expectedEmailData = {
        to: 'alice@example.com',
        webId: aliceWebId,
        deleteUrl: 'delete account url'
      }

      await accountManager.sendDeleteAccountEmail(userAccount)
      expect(accountManager.getAccountDeleteUrl)
        .to.have.been.calledWith(deleteToken)
      expect(emailService.sendWithTemplate)
        .to.have.been.calledWith('delete-account', expectedEmailData)
    })

    it('should reject if no email service is set up', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      accountManager.sendDeleteAccountEmail(userAccount)
        .catch(error => {
          expect(error.message).to.equal('Email service is not set up')
          done()
        })
    })

    it('should reject if no user email is provided', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }
      const emailService = {}
      const host = ServerHost.from({
        serverUri: 'https://example.com'
      })
      const options = testAccountManagerOptions(host, { emailService })
      const accountManager = AccountManager.from(options)

      accountManager.sendDeleteAccountEmail(userAccount)
        .catch(error => {
          expect(error.message).to.equal('Account recovery email has not been provided')
          done()
        })
    })
  })

  describe('isValidUsername', () => {
    it('should accept valid usernames', () => {
      const usernames = [
        'foo',
        'bar'
      ]
      const validUsernames = usernames.filter(username => isValidUsername(username))
      expect(validUsernames.length).to.equal(usernames.length)
    })

    it('should not accept invalid usernames', () => {
      const usernames = [
        '-',
        '-a',
        'a-',
        '9-',
        'alice--bob',
        'alice bob',
        'alice.bob'
      ]
      const validUsernames = usernames.filter(username => isValidUsername(username))
      expect(validUsernames.length).to.equal(0)
    })
  })

  describe('saveCredentialsFor()', () => {
    it('should create a new user in the user store', async () => {
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)
      const password = '12345'
      const userAccount = UserAccount.from({
        username: 'alice',
        webId: 'https://alice.example.com'
      })
      accountManager.storage.users = {
        createUser: (userAccount, password) => { return Promise.resolve() }
      }
      const createUserSpy = sinon.spy(accountManager.storage.users,
        'createUser')

      await accountManager.saveCredentialsFor({ userAccount, password })
      expect(createUserSpy).to.have.been.calledWith(userAccount, password)
    })
  })
})
