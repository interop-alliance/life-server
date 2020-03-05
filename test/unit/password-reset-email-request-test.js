'use strict'

const chai = require('chai')
const sinon = require('sinon')
const expect = chai.expect
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const HttpMocks = require('node-mocks-http')

const PasswordResetEmailRequest = require('../../lib/account-mgmt/password-reset-email-request')
const { AccountManager } = require('../../lib/account-mgmt/account-manager')
const ServerHost = require('../../lib/server-host')
const { testAccountManagerOptions } = require('../utils')

describe('PasswordResetEmailRequest', () => {
  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const options = {
        returnToUrl: 'https://example.com/resource',
        response: res,
        username: 'alice'
      }

      const request = new PasswordResetEmailRequest(options)

      expect(request.returnToUrl).to.equal(options.returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.username).to.equal(options.username)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const accountManager = {}

      const req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      const res = HttpMocks.createResponse()

      const request = PasswordResetEmailRequest.fromParams(req, res)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.returnToUrl).to.equal(returnToUrl)
      expect(request.username).to.equal(username)
      expect(request.response).to.equal(res)
    })
  })

  describe('get()', () => {
    it('should create an instance and render a reset password form', () => {
      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const accountManager = { multiuser: true }

      const req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      const res = HttpMocks.createResponse()
      res.render = sinon.stub()

      PasswordResetEmailRequest.get(req, res)

      expect(res.render).to.have.been.calledWith('auth/reset-password',
        { returnToUrl, multiuser: true, title: 'Reset Password' })
    })
  })

  describe('post()', () => {
    it('creates a request instance and invokes handlePost()', () => {
      sinon.spy(PasswordResetEmailRequest, 'handlePost')

      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'

      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const options = testAccountManagerOptions(host)
      const accountManager = AccountManager.from(options)

      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()

      const req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      const res = HttpMocks.createResponse()

      PasswordResetEmailRequest.post(req, res)
        .then(() => {
          expect(PasswordResetEmailRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('validate()', () => {
    it('should throw an error if username is missing in multi-user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const accountManager = AccountManager.from(testAccountManagerOptions(host))

      const request = new PasswordResetEmailRequest({ accountManager })

      expect(() => request.validate()).to.throw(/Username required/)
    })

    it('should not throw an error if username is missing in single user mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: false
      })
      const accountManager = AccountManager.from(testAccountManagerOptions(host))

      const request = new PasswordResetEmailRequest({ accountManager })

      expect(() => request.validate()).to.not.throw()
    })
  })

  describe('handlePost()', () => {
    it('should handle the post request', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const accountManager = AccountManager.from(testAccountManagerOptions(host))

      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()
      accountManager.accountExists = sinon.stub().resolves(true)

      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const response = HttpMocks.createResponse()
      response.render = sinon.stub()

      const options = { accountManager, username, returnToUrl, response }
      const request = new PasswordResetEmailRequest(options)

      sinon.spy(request, 'error')

      return PasswordResetEmailRequest.handlePost(request)
        .then(() => {
          expect(accountManager.loadAccountRecoveryEmail).to.have.been.called()
          expect(accountManager.sendPasswordResetEmail).to.have.been.called()
          expect(response.render).to.have.been.calledWith('auth/reset-link-sent')
          expect(request.error).to.not.have.been.called()
        })
    })
  })

  describe('loadUser()', () => {
    it('should return a UserAccount instance based on username', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const accountManager = AccountManager.from(testAccountManagerOptions(host))
      accountManager.accountExists = sinon.stub().resolves(true)
      const username = 'alice'

      const options = { accountManager, username }
      const request = new PasswordResetEmailRequest(options)

      return request.loadUser()
        .then(account => {
          expect(account.webId).to.equal('https://alice.example.com/web#id')
        })
    })

    it('should throw an error if the user does not exist', done => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const accountManager = AccountManager.from(testAccountManagerOptions(host))
      accountManager.accountExists = sinon.stub().resolves(false)
      const username = 'alice'

      const options = { accountManager, username }
      const request = new PasswordResetEmailRequest(options)

      request.loadUser()
        .catch(error => {
          expect(error.message).to.equal('Account not found for that username')
          done()
        })
    })
  })
})
