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

const PasswordChangeRequest = require('../../src/accounts/password-change-request')

describe('PasswordChangeRequest', () => {
  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const accountManager = {}
      const userStore = {}

      const options = {
        accountManager,
        storage: { users: userStore },
        returnToUrl: 'https://example.com/resource',
        response: res,
        token: '12345',
        newPassword: 'swordfish'
      }

      const request = new PasswordChangeRequest(options)

      expect(request.returnToUrl).to.equal(options.returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.token).to.equal(options.token)
      expect(request.newPassword).to.equal(options.newPassword)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('fromIncoming()', () => {
    it('should return a request instance from options', () => {
      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const newPassword = 'swordfish'
      const accountManager = {}
      const userStore = {}

      const req = {
        app: { locals: { accountManager, storage: { users: userStore } } },
        query: { returnToUrl, token },
        body: { newPassword }
      }
      const res = HttpMocks.createResponse()

      const request = PasswordChangeRequest.fromIncoming(req, res)

      expect(request.returnToUrl).to.equal(returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.token).to.equal(token)
      expect(request.newPassword).to.equal(newPassword)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('handleGet()', () => {
    const returnToUrl = 'https://example.com/resource'
    const token = '12345'
    const userStore = {}
    const res = HttpMocks.createResponse()
    sinon.spy(res, 'render')

    it('should render a change password form', async () => {
      const accountManager = {
        validateResetToken: sinon.stub().resolves(true)
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token }
      }

      const request = PasswordChangeRequest.fromIncoming(req, res)

      await request.handleGet()

      expect(accountManager.validateResetToken)
        .to.have.been.called()
      expect(res.render).to.have.been.calledWith('auth/change-password',
        { returnToUrl, token, validToken: true, title: 'Change Password' })
    })

    it('should display an error message on an invalid token', async () => {
      const accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token }
      }

      const request = PasswordChangeRequest.fromIncoming(req, res)
      request.error = sinon.stub()

      await request.handleGet()

      expect(request.error).to.have.been.called()
    })
  })

  describe('handlePost()', () => {
    it('should change password on valid token', async () => {
      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const newPassword = 'swordfish'
      const userStore = {}
      const res = HttpMocks.createResponse()
      const accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token },
        body: { newPassword }
      }
      const tokenContents = {}

      const request = PasswordChangeRequest.fromIncoming(req, res)
      request.validateToken = sinon.stub().returns(tokenContents)
      request.changePassword = sinon.stub().resolves()
      request.renderSuccess = sinon.stub()
      request.error = sinon.stub()

      await request.handlePost()

      expect(request.error).to.not.have.been.called()
      expect(request.validateToken).to.have.been.called()
      expect(request.changePassword).to.have.been.called()
      expect(request.renderSuccess).to.have.been.called()
    })

    it('should display error if validation error encountered', async () => {
      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const userStore = {}
      const res = HttpMocks.createResponse()
      const accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token }
      }

      const request = PasswordChangeRequest.fromIncoming(req, res)
      request.error = sinon.stub()

      await request.handlePost()

      expect(request.error).to.have.been.called()
    })
  })

  describe('validateToken()', () => {
    it('should return false if no token is present', () => {
      const accountManager = {
        validateResetToken: sinon.stub()
      }
      const request = new PasswordChangeRequest({ accountManager, token: null })

      const result = request.validateToken()
      expect(result).to.be.false()
      expect(accountManager.validateResetToken).to.not.have.been.called()
    })
  })

  describe('validatePost()', () => {
    it('should throw an error if no new password was entered', () => {
      const request = new PasswordChangeRequest({ newPassword: null })

      expect(() => request.validatePost()).to.throw('Please enter a new password')
    })
  })

  describe('error()', () => {
    it('should invoke renderForm() with the error', () => {
      const request = new PasswordChangeRequest({})
      request.renderForm = sinon.stub()
      const error = new Error('error message')

      request.error(error)

      expect(request.renderForm).to.have.been.calledWith(error)
    })
  })

  describe('changePassword()', () => {
    it('should create a new user store entry if none exists', () => {
      // this would be the case for legacy pre-user-store accounts
      const webId = 'https://alice.example.com/#me'
      const user = { webId, id: webId }
      const accountManager = {
        userAccountFrom: sinon.stub().returns(user)
      }
      const users = {
        findUser: sinon.stub().resolves(null), // no user found
        createUser: sinon.stub().resolves(),
        updatePassword: sinon.stub().resolves()
      }

      const options = {
        accountManager, storage: { users }, newPassword: 'swordfish'
      }
      const request = new PasswordChangeRequest(options)

      return request.changePassword(user)
        .then(() => {
          expect(users.createUser).to.have.been.calledWith(user, options.newPassword)
        })
    })
  })

  describe('renderForm()', () => {
    it('should set response status to error status, if error exists', () => {
      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const response = HttpMocks.createResponse()
      sinon.spy(response, 'render')

      const options = { returnToUrl, token, response }

      const request = new PasswordChangeRequest(options)

      const error = new Error('error message')

      request.renderForm(error)

      expect(response.render).to.have.been.calledWith('auth/change-password',
        { validToken: false, token, returnToUrl, error: 'error message', title: 'Change Password' })
    })
  })
})
