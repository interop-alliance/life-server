'use strict'

const chai = require('chai')
const sinon = require('sinon')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const SelectProviderRequest = require('../../lib/authentication/handlers/select-provider-request')

describe('SelectProviderRequest', () => {
  describe('normalizeWebId()', () => {
    it('should prepend https:// if one is missing', () => {
      const result = SelectProviderRequest.normalizeUri('localhost:8443')
      expect(result).to.equal('https://localhost:8443')
    })

    it('should return null if given a null uri', () => {
      const result = SelectProviderRequest.normalizeUri(null)
      expect(result).to.be.null()
    })

    it('should return a valid uri unchanged', () => {
      const result = SelectProviderRequest.normalizeUri('https://alice.example.com')
      expect(result).to.equal('https://alice.example.com')
    })
  })

  describe('validate()', () => {
    it('should throw a 500 error if no oidcManager was initialized', (done) => {
      const aliceWebId = 'https://alice.example.com'
      const options = {
        webId: aliceWebId
      }
      const request = new SelectProviderRequest(options)

      try {
        request.validate()
      } catch (error) {
        expect(error.statusCode).to.equal(500)
        done()
      }
    })

    it('should throw a 400 error if no webid is submitted', (done) => {
      const options = {
        oidcManager: {}
      }
      const request = new SelectProviderRequest(options)

      try {
        request.validate()
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        done()
      }
    })

    it('should throw a 400 if an invalid webid was submitted', (done) => {
      const options = {
        webId: 'invalidWebId',
        oidcManager: {}
      }
      const request = new SelectProviderRequest(options)

      try {
        request.validate()
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        done()
      }
    })
  })

  describe('fromParams()', () => {
    const res = HttpMocks.createResponse()
    const serverUri = 'https://example.com'

    // 'https%3A%2F%2Foriginal.com%2Fpath%23hash'
    const returnToUrl = encodeURIComponent('https://original.com/path#hash')

    it('should initialize a SelectProviderRequest instance', () => {
      const aliceWebId = 'https://alice.example.com'
      const oidcManager = {}
      const session = {}
      const req = {
        session,
        body: { webid: aliceWebId },
        query: { returnToUrl },
        app: { locals: { oidc: oidcManager, host: { serverUri } } }
      }

      const request = SelectProviderRequest.fromParams(req, res)
      expect(request.webId).to.equal(aliceWebId)
      expect(request.response).to.equal(res)
      expect(request.oidcManager).to.equal(oidcManager)
      expect(request.session).to.equal(session)
      expect(request.serverUri).to.equal(serverUri)
      expect(request.returnToUrl).to.equal(returnToUrl)
    })

    it('should attempt to normalize an invalid webid uri', () => {
      const oidcManager = {}
      const session = {}
      const req = {
        session,
        body: { webid: 'alice.example.com' },
        app: { locals: { oidc: oidcManager, host: { serverUri } } }
      }

      const request = SelectProviderRequest.fromParams(req, res)
      expect(request.webId).to.equal('https://alice.example.com')
    })
  })

  describe('static get()', () => {
    it('creates a request instance and renders the select provider view', () => {
      const serverUri = 'https://example.com'
      const req = {
        app: { locals: { oidc: {}, host: { serverUri } } }
      }
      const res = {}
      res.render = sinon.stub()

      SelectProviderRequest.get(req, res)

      expect(res.render).to.have.been.calledWith('auth/select-provider', { serverUri })
    })
  })

  describe('saveReturnToUrl()', () => {
    it('should save the returnToUrl in session', () => {
      const response = HttpMocks.createResponse()
      const session = {}
      const returnToUrl = encodeURIComponent('https://example.com/path#hash')
      const request = new SelectProviderRequest({ response, session, returnToUrl })

      request.saveReturnToUrl()

      expect(request.session.returnToUrl).to.equal(returnToUrl)
    })
  })

  describe('selectProvider()', () => {
    it('should fetch the provider uri and redirect user to its /authorize endpoint', () => {
      const webId = 'https://example.com/#me'
      const clientStore = {}
      const authUrl = 'https://example.com/authorize?client_id=1234'
      clientStore.authUrlForIssuer = sinon.stub().resolves(authUrl)
      const oidcManager = {
        clients: clientStore
      }

      const response = HttpMocks.createResponse()
      const session = {}

      const request = new SelectProviderRequest({ webId, oidcManager, response, session })

      const providerUri = 'https://example.com'
      request.preferredProviderUrl = sinon.stub().resolves(providerUri)

      return request.selectProvider()
        .then(() => {
          expect(request.preferredProviderUrl).to.have.been.called()
          expect(clientStore.authUrlForIssuer).to.have.been.calledWith(providerUri, session)
          expect(request.response._getRedirectUrl()).to.equal(authUrl)
        })
    })
  })

  describe('error()', () => {
    it('should render select provider form with appropriate error message', () => {
      const response = HttpMocks.createResponse()
      response.render = sinon.stub()

      const request = new SelectProviderRequest({ response })

      const error = new Error('error message')
      error.statusCode = 404

      request.error(error)

      expect(request.response.statusCode).to.equal(404)
      expect(response.render).to
        .have.been.calledWith('auth/select-provider', { error: 'error message' })
    })
  })

  describe('handlePost()', () => {
    it('should validate the request and select the provider', async () => {
      const request = new SelectProviderRequest({})

      request.validate = sinon.stub().resolves()
      request.selectProvider = sinon.stub().resolves()
      request.saveReturnToUrl = sinon.stub()

      await SelectProviderRequest.handlePost(request)
      expect(request.validate).to.have.been.called()
      expect(request.selectProvider).to.have.been.called()
      expect(request.saveReturnToUrl).to.have.been.called()
    })

    it('should route any errors to the request.error() handler', async () => {
      const request = new SelectProviderRequest({})
      request.saveReturnToUrl = sinon.stub()

      const thrownError = new Error('validation error')
      request.validate = sinon.stub().throws(thrownError)
      request.error = sinon.stub()

      await SelectProviderRequest.handlePost(request)
      expect(request.error).to.have.been.calledWith(thrownError)
    })
  })

  describe('post()', () => {
    const SelectProviderRequest = require('../../lib/authentication/handlers/select-provider-request')

    it('should create a request instance and invoke handlePost()', () => {
      const req = HttpMocks.createRequest()
      const res = HttpMocks.createResponse()

      const request = new SelectProviderRequest({})

      SelectProviderRequest.fromParams = sinon.stub().returns(request)
      SelectProviderRequest.handlePost = sinon.stub().resolves()

      return SelectProviderRequest.post(req, res)
        .then(() => {
          expect(SelectProviderRequest.fromParams)
            .to.have.been.calledWith(req, res)
          expect(SelectProviderRequest.handlePost)
            .to.have.been.calledWith(request)
        })
    })
  })
})
