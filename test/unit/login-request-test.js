'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()
const HttpMocks = require('node-mocks-http')

const AuthRequest = require('../../src/authentication/auth-request')
const { LoginRequest } = require('../../src/authentication/login-request')

const ServerHost = require('../../src/server/server-host')
// const { AccountManager } = require('../../src/accounts/account-manager')
// const { testAccountManagerOptions } = require('../utils')

const mockUserCredentialStore = {
  findUser: () => { return Promise.resolve(true) },
  matchPassword: (user, password) => { return Promise.resolve(user) }
}

// const authMethod = 'oidc'
const host = ServerHost.from({
  serverUri: 'https://localhost:8443'
})
// const options = testAccountManagerOptions(host, { authMethod })

const localAuth = { password: true }

describe('LoginRequest', () => {
  describe('loginPassword()', () => {
    let res, req

    beforeEach(() => {
      req = {
        app: {
          locals: { storage: { users: mockUserCredentialStore }, localAuth, host }
        },
        body: { username: 'alice', password: '12345' }
      }
      res = HttpMocks.createResponse()
    })

    it('should create a LoginRequest instance', () => {
      const fromParams = sinon.spy(LoginRequest, 'fromParams')
      const loginStub = sinon.stub(LoginRequest, 'login')
        .returns(Promise.resolve())

      return LoginRequest.loginPassword(req, res)
        .then(() => {
          expect(fromParams).to.have.been.calledWith(req, res)
          fromParams.resetHistory()
          loginStub.restore()
        })
    })

    it('should invoke login()', () => {
      const login = sinon.spy(LoginRequest, 'login')

      return LoginRequest.loginPassword(req, res)
        .then(() => {
          expect(login).to.have.been.called()
          login.resetHistory()
        })
    })
  })

  describe('fromParams()', () => {
    const session = {}
    const req = {
      session,
      app: { locals: { host } },
      body: { username: 'alice', password: '12345' }
    }
    const res = HttpMocks.createResponse()

    it('should return a LoginRequest instance', () => {
      const request = LoginRequest.fromParams(req, res)

      expect(request.response).to.equal(res)
      expect(request.session).to.equal(session)
      expect(request.host).to.equal(host)
    })

    it('should initialize the query params', () => {
      const requestOptions = sinon.spy(AuthRequest, 'requestOptions')
      LoginRequest.fromParams(req, res)

      expect(requestOptions).to.have.been.calledWith(req)
    })
  })

  describe('login()', () => {
    const userStore = mockUserCredentialStore
    let response

    const options = {
      userStore,
      host,
      localAuth: {}
    }

    beforeEach(() => {
      response = HttpMocks.createResponse()
    })

    it('should call initUserSession() for a valid user', () => {
      const validUser = {}
      options.response = response
      options.authenticator = {
        findValidUser: sinon.stub().resolves(validUser)
      }

      const request = new LoginRequest(options)

      const initUserSession = sinon.spy(request, 'initUserSession')

      return LoginRequest.login(request)
        .then(() => {
          expect(initUserSession).to.have.been.calledWith(validUser)
        })
    })

    it('should call sendResponse()', () => {
      const validUser = {}
      options.response = response
      options.authenticator = {
        findValidUser: sinon.stub().resolves(validUser)
      }

      const request = new LoginRequest(options)

      const sendResponse = sinon.spy(request, 'sendResponse')

      return LoginRequest.login(request)
        .then(() => {
          expect(sendResponse).to.have.been.calledWith(validUser)
        })
    })
  })

  describe('postLoginUrl()', () => {
    it('should return the user account uri if no redirect_uri param', () => {
      const request = new LoginRequest({ authQueryParams: {} })

      const aliceAccount = 'https://alice.example.com'
      const user = { accountUri: aliceAccount }

      expect(request.postLoginUrl(user)).to.equal(aliceAccount)
    })
  })
})
