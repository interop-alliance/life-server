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

const DeleteAccountConfirmRequest = require('../../src/account-mgmt/delete-account-confirm-request')

describe('DeleteAccountConfirmRequest', () => {
  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const accountManager = {}
      const userStore = {}

      const options = {
        accountManager,
        storage: { users: userStore },
        response: res,
        token: '12345'
      }

      const request = new DeleteAccountConfirmRequest(options)

      expect(request.response).to.equal(res)
      expect(request.token).to.equal(options.token)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('fromIncoming()', () => {
    it('should return a request instance from options', () => {
      const token = '12345'
      const accountManager = {}
      const userStore = {}

      const req = {
        app: { locals: { accountManager, storage: { users: userStore } } },
        query: { token }
      }
      const res = HttpMocks.createResponse()

      const request = DeleteAccountConfirmRequest.fromIncoming(req, res)

      expect(request.response).to.equal(res)
      expect(request.token).to.equal(token)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('handleGet()', () => {
    const token = '12345'
    const userStore = {}
    const res = HttpMocks.createResponse()
    sinon.spy(res, 'render')

    it('should create an instance, render a delete account form', async () => {
      const accountManager = {
        validateDeleteToken: sinon.stub().resolves(true)
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }

      const request = DeleteAccountConfirmRequest.fromIncoming(req, res)
      request.error = (error) => { throw error }
      await request.handleGet()

      expect(accountManager.validateDeleteToken)
        .to.have.been.called()
      expect(res.render).to.have.been.calledWith('account/delete-confirm',
        { token, validToken: true })
    })

    it('should display an error message on an invalid token', async () => {
      const accountManager = {
        validateDeleteToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }

      const request = DeleteAccountConfirmRequest.fromIncoming(req, res)
      request.error = sinon.stub()

      await request.handleGet()

      expect(request.error).to.have.been.called()
    })
  })

  describe('handlePost()', () => {
    it('should display error if validation error encountered', async () => {
      const token = '12345'
      const userStore = {}
      const res = HttpMocks.createResponse()
      const accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }

      const request = DeleteAccountConfirmRequest.fromIncoming(req, res)
      request.error = sinon.stub()

      await request.handlePost()

      expect(request.error).to.have.been.called()
    })
  })

  describe('validateToken()', () => {
    it('should return false if no token is present', () => {
      const accountManager = {
        validateDeleteToken: sinon.stub()
      }
      const request = new DeleteAccountConfirmRequest({ accountManager, token: null })

      const result = request.validateToken()
      expect(result).to.be.false()
      expect(accountManager.validateDeleteToken).to.not.have.been.called()
    })
  })

  describe('error()', () => {
    it('should invoke renderForm() with the error', () => {
      const request = new DeleteAccountConfirmRequest({})
      request.renderForm = sinon.stub()
      const error = new Error('error message')

      request.error(error)

      expect(request.renderForm).to.have.been.calledWith(error)
    })
  })

  describe('deleteAccount()', () => {
    it('should remove user from userStore and remove directories', () => {
      const webId = 'https://alice.example.com/#me'
      const user = { webId, id: webId }
      const accountManager = {
        userAccountFrom: sinon.stub().returns(user),
        deleteAccountStorage: sinon.stub().resolves()
      }
      const users = {
        deleteUser: sinon.stub().resolves()
      }

      const options = {
        accountManager, storage: { users }
      }
      const request = new DeleteAccountConfirmRequest(options)
      const tokenContents = { webId }

      return request.deleteAccount(tokenContents)
        .then(() => {
          expect(accountManager.userAccountFrom).to.have.been.calledWith(tokenContents)
          expect(accountManager.deleteAccountStorage).to.have.been.calledWith(user)
          expect(users.deleteUser).to.have.been.calledWith(user)
        })
    })
  })

  describe('renderForm()', () => {
    it('should set response status to error status, if error exists', () => {
      const token = '12345'
      const response = HttpMocks.createResponse()
      sinon.spy(response, 'render')

      const options = { token, response }

      const request = new DeleteAccountConfirmRequest(options)

      const error = new Error('error message')

      request.renderForm(error)

      expect(response.render).to.have.been.calledWith('account/delete-confirm',
        { validToken: false, token, error: 'error message' })
    })
  })
})
