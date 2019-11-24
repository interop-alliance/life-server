'use strict'

const chai = require('chai')
const sinon = require('sinon')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const AuthCallbackRequest = require('../../lib/authentication/handlers/auth-callback-request')

describe('AuthCallbackRequest', () => {
  let res

  beforeEach(() => {
    res = HttpMocks.createResponse()
  })

  describe('constructor()', () => {
    it('should initialize with provided options', () => {
      const options = {
        requestUri: 'https://example.com/api/auth/rp/localhost',
        issuer: 'https://another.server.com',
        oidcManager: {},
        response: res,
        session: {},
        serverUri: 'https://example.com',
        returnToUrl: 'https://example.com/resource'
      }

      const request = new AuthCallbackRequest(options)

      expect(request.requestUri).to.equal(options.requestUri)
      expect(request.issuer).to.equal(options.issuer)
      expect(request.oidcManager).to.equal(options.oidcManager)
      expect(request.response).to.equal(options.response)
      expect(request.session).to.equal(options.session)
      expect(request.serverUri).to.equal(options.serverUri)
      expect(request.returnToUrl).to.equal(options.returnToUrl)
    })
  })

  describe('AuthCallbackRequest.get', () => {
    it('should create a request instance', () => {
      const AuthCallbackRequest = require('../../lib/authentication/handlers/auth-callback-request')
      const req = HttpMocks.createRequest({ session: {}, app: { locals: {} } })
      const next = () => {}

      sinon.spy(AuthCallbackRequest, 'fromParams')
      AuthCallbackRequest.handle = sinon.stub().resolves(null)

      return AuthCallbackRequest.get(req, res, next)
        .then(() => {
          expect(AuthCallbackRequest.fromParams).to.have.been.calledWith(req, res)
        })
    })
  })

  describe('fromParams()', () => {
    it('should initialize an AuthCallbackRequest instance from request params', () => {
      const AuthCallbackRequest = require('../../lib/authentication/handlers/auth-callback-request')

      const requestUri = 'https://example.com/api/oidc/rp'

      const oidcManager = {}
      const host = {
        serverUri: 'https://example.com',
        parseTargetUrl: sinon.stub().returns(requestUri)
      }
      const returnToUrl = 'https://example.com/resource#hash'
      const session = { returnToUrl }

      const req = {
        session,
        app: { locals: { oidc: oidcManager, host } },
        params: {
          issuer_id: encodeURIComponent(host.serverUri)
        }
      }
      const res = HttpMocks.createResponse()

      const request = AuthCallbackRequest.fromParams(req, res)

      expect(request.issuer).to.equal('https://example.com')
      expect(request.serverUri).to.equal('https://example.com')
      expect(request.requestUri).to.equal(requestUri)
      expect(request.oidcManager).to.equal(oidcManager)
      expect(request.response).to.equal(res)
      expect(request.session).to.equal(session)
      expect(request.returnToUrl).to.equal(returnToUrl)
    })
  })

  describe('validate()', () => {
    it('should throw an error if issuer param is missing', () => {
      const request = new AuthCallbackRequest({ issuer: 'https://example.com' })

      expect(() => request.validate()).to.not.throw(Error)

      request.issuer = null

      expect(() => request.validate()).to.throw(Error)
    })
  })

  describe('loadClient()', () => {
    it('should load an rp by issuer from the client store', () => {
      const issuer = 'https://example.com'
      const client = {}
      const oidcManager = {
        clients: {}
      }
      oidcManager.clients.clientForIssuer = sinon.stub().resolves(client)

      const request = new AuthCallbackRequest({ issuer, oidcManager })

      return request.loadClient()
        .then(loadedClient => {
          expect(oidcManager.clients.clientForIssuer)
            .to.have.been.calledWith(issuer)
          expect(loadedClient).to.equal(client)
        })
    })
  })

  describe('initSessionUserAuth()', () => {
    const aliceWebId = 'https://alice.example.com/#me'
    const idClaims = {
      sub: aliceWebId,
      iss: 'https://example.com'
    }
    const authorization = {}
    const rpSession = { idClaims, authorization }

    it('should init session with user credentials', async () => {
      const oidcManager = {}
      oidcManager.webIdFromClaims = sinon.stub().resolves(aliceWebId)

      const request = new AuthCallbackRequest({ session: {}, oidcManager })

      await request.initSessionUserAuth(rpSession)

      expect(oidcManager.webIdFromClaims).to.have.been.calledWith(idClaims)

      const { session } = request // Express cookie session

      expect(session.userId).to.equal(aliceWebId)

      const expectedCredentials = {
        webId: aliceWebId,
        idClaims,
        authorization
      }
      expect(session.credentials).to.eql(expectedCredentials)
    })
  })

  describe('validateResponse()', () => {
    it('should validate the response', () => {
      const client = {}
      client.validateResponse = sinon.stub().resolves()

      const requestUri = 'https://example.com/callback'
      const session = {}

      const request = new AuthCallbackRequest({ requestUri, session })

      return request.validateResponse(client)
        .then(() => {
          expect(client.validateResponse).to
            .have.been.calledWith(requestUri, session)
        })
    })
  })

  describe('resumeUserWorkflow()', () => {
    it('should redirect to the returnToUrl and clear it from session', () => {
      const response = HttpMocks.createResponse()
      const returnToUrl = 'https://example.com/resource'
      const session = { returnToUrl }

      const request = new AuthCallbackRequest({ session, response, returnToUrl })

      request.resumeUserWorkflow()

      expect(response._getRedirectUrl()).to.equal('https://example.com/resource')
      expect(session.returnToUrl).to.not.exist()
    })
  })
})
