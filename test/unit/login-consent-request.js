'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const LoginConsentRequest = require('../../lib/authentication/handlers/login-consent-request')

function createOpAuthRequest (overwrite) {
  return Object.assign({
    req: {
      body: {},
      app: {
        locals: {
          ldp: {
            serverUri: 'https://pod.example'
          }
        }
      },
      session: {
        consentedOrigins: ['https://example.com']
      }
    },
    res: HttpMocks.createResponse(),
    subject: {},
    params: {
      redirect_uri: 'https://example.com'
    },
    host: {}
  }, overwrite)
}

describe('LoginConsentRequest', () => {
  describe('constructor()', () => {
    it('should initialize a new instance', () => {
      let params = { consent: true, scope: 'openid' }
      let options = {
        opAuthRequest: {},
        params,
        response: {}
      }

      let request = new LoginConsentRequest(options)

      expect(request.opAuthRequest).to.equal(options.opAuthRequest)
      expect(request.params).to.equal(options.params)
      expect(request.response).to.equal(options.response)
    })
  })

  describe('extractParams()', () => {
    it('should use req.query if present', () => {
      let req = { query: { client_id: '1234' } }
      let res = HttpMocks.createResponse()
      let opAuthRequest = { req, res }

      let params = LoginConsentRequest.extractParams(opAuthRequest)

      expect(params['client_id']).to.equal(req.query['client_id'])
    })

    it('should use req.body if req.query is not present', () => {
      let req = { body: { client_id: '1234' } }
      let res = HttpMocks.createResponse()
      let opAuthRequest = { req, res }

      let params = LoginConsentRequest.extractParams(opAuthRequest)

      expect(params['client_id']).to.equal(req.body['client_id'])
    })
  })

  describe('from()', () => {
    it('should return an initialized instance', () => {
      let body = { consent: true, scope: 'openid' }
      let req = { body }
      let res = HttpMocks.createResponse()
      let opAuthRequest = { req, res }

      let request = LoginConsentRequest.from(opAuthRequest)

      expect(request.opAuthRequest).to.equal(opAuthRequest)
      expect(request.params).to.equal(req.body)
      expect(request.response).to.equal(res)
    })
  })

  describe('handle()', () => {
    it('should return the opAuthRequest object', () => {
      let opAuthRequest = createOpAuthRequest()

      return LoginConsentRequest.handle(opAuthRequest)
        .then(returnedRequest => {
          expect(returnedRequest).to.equal(opAuthRequest)
        })
    })

    it('should invoke obtainConsent()', () => {
      let opAuthRequest = createOpAuthRequest()

      let obtainConsent = sinon.spy(LoginConsentRequest, 'obtainConsent')

      return LoginConsentRequest.handle(opAuthRequest)
        .then(() => {
          expect(obtainConsent).to.have.been.called()
          obtainConsent.resetHistory()
        })
    })

    it('should pass through opAuthRequest if skipConsent is set', () => {
      let opAuthRequest = createOpAuthRequest()
      let skipConsent = true

      return LoginConsentRequest.handle(opAuthRequest, skipConsent)
        .then(() => {
          expect(LoginConsentRequest.obtainConsent).to.not.have.been.called()
          LoginConsentRequest.obtainConsent.resetHistory()
        })
    })
  })

  describe('clientId getter', () => {
    it('should return the client_id param', () => {
      let res = HttpMocks.createResponse()
      let body = { 'client_id': '1234' }
      let opAuthRequest = { req: { body }, res }

      let request = LoginConsentRequest.from(opAuthRequest)

      expect(request.clientId).to.equal('1234')
    })
  })

  describe.skip('isLocalRpClient()', () => {
    it('should be false if host has no local client initialized', () => {
      let params = { 'client_id': '1234' }
      let res = HttpMocks.createResponse()
      let opAuthRequest = createOpAuthRequest({ res })

      let request = new LoginConsentRequest({ params, res, opAuthRequest })

      expect(request.isLocalRpClient('1234')).to.be.false()
    })

    it('should be false if params has no client id', () => {
      let params = {}
      let res = HttpMocks.createResponse()
      let opAuthRequest = createOpAuthRequest({ res })

      let request = new LoginConsentRequest({ params, res, opAuthRequest })

      expect(request.isLocalRpClient(undefined)).to.be.false()
    })

    it('should be false if host local app origin does not equal param server uri', () => {
      let params = {}
      let res = HttpMocks.createResponse()
      let opAuthRequest = createOpAuthRequest({
        res
      })

      let request = new LoginConsentRequest({ params, res, opAuthRequest })

      expect(request.isLocalRpClient('https://example.com')).to.be.false()
    })

    it('should be true if host local app origin equals param server uri', () => {
      let params = {}
      let res = HttpMocks.createResponse()
      let opAuthRequest = createOpAuthRequest({
        res
      })

      let request = new LoginConsentRequest({ params, res, opAuthRequest })

      expect(request.isLocalRpClient('https://pod.example')).to.be.true()
    })
  })

  describe.skip('obtainConsent()', () => {
    describe('if request is for a local rp client', () => {
      let req, res, opAuthRequest
      const host = { localClientId: '1234' }
      const clientId = '1234'

      beforeEach(() => {
        req = { body: { scope: 'openid', client_id: clientId } }
        res = HttpMocks.createResponse()
        opAuthRequest = createOpAuthRequest({ res, host })
        opAuthRequest = Object.assign(opAuthRequest, {
          req: Object.assign(opAuthRequest.req, {
            body: req.body
          })
        })
      })

      it('should mark successful consent automatically', () => {
        let request = LoginConsentRequest.from(opAuthRequest)

        return LoginConsentRequest.obtainConsent(request)
          .then(opAuthRequest => {
            expect(opAuthRequest.consent).to.be.true()
            expect(opAuthRequest.scope).to.equal('openid')
          })
      })

      it('should not call checkSavedConsentFor()', () => {
        let request = LoginConsentRequest.from(opAuthRequest)

        let checkSavedConsentFor = sinon.spy(request, 'checkSavedConsentFor')

        return LoginConsentRequest.obtainConsent(request)
          .then(() => {
            expect(checkSavedConsentFor).to.not.have.been.called()
          })
      })
    })

    describe('if body.consent param is present', () => {
      let req, res, opAuthRequest
      const host = {}
      const clientId = '1234'

      beforeEach(() => {
        req = { body: { consent: true, scope: 'openid', client_id: clientId } }
        res = HttpMocks.createResponse()
        opAuthRequest = createOpAuthRequest({ res, host })
        opAuthRequest = Object.assign(opAuthRequest, {
          req: Object.assign(opAuthRequest.req, {
            body: req.body
          })
        })
      })

      it('should call saveConsentForClient()', () => {
        let request = LoginConsentRequest.from(opAuthRequest)

        request.saveConsentForClient = sinon.mock().returns(Promise.resolve())

        return LoginConsentRequest.obtainConsent(request)
          .then(() => {
            expect(request.saveConsentForClient).to.have.been.called()
          })
      })

      it('should set consent property on request', () => {
        let request = LoginConsentRequest.from(opAuthRequest)

        return LoginConsentRequest.obtainConsent(request)
          .then(opAuthRequest => {
            expect(opAuthRequest.consent).to.be.true()
          })
      })

      it('should set scope property on request', () => {
        let request = LoginConsentRequest.from(opAuthRequest)

        return LoginConsentRequest.obtainConsent(request)
          .then(opAuthRequest => {
            expect(opAuthRequest.scope).to.equal('openid')
          })
      })

      it('should not render any pages', () => {
        let render = sinon.stub(opAuthRequest.res, 'render')
        let request = LoginConsentRequest.from(opAuthRequest)

        return LoginConsentRequest.obtainConsent(request)
          .then(opAuthRequest => {
            expect(render).to.not.have.been.called()
          })
      })
    })

    describe('if body.consent param is NOT present', () => {
      let req, res, opAuthRequest

      beforeEach(() => {
        req = { body: { scope: 'openid' } }
        res = HttpMocks.createResponse()
        opAuthRequest = createOpAuthRequest({ res })
        opAuthRequest = Object.assign(opAuthRequest, {
          req: Object.assign(opAuthRequest.req, {
            session: {
              consentedOrigins: []
            },
            body: req.body
          })
        })
      })

      describe('if user consent has been previously saved', () => {
        it('should have marked the request as successful', async () => {
          const request = LoginConsentRequest.from(opAuthRequest)

          request.checkSavedConsentFor = sinon.mock().resolves(true)

          opAuthRequest = await LoginConsentRequest.obtainConsent(request)
          expect(opAuthRequest.consent).to.be.true()
          expect(opAuthRequest.scope).to.equal('openid')
        })

        // it('should not have called renderConsentPage()', () => {
        // })
      })

      describe('if user consent has NOT been previously saved', () => {
        it('should call redirectToConsent()', () => {
          let request = LoginConsentRequest.from(opAuthRequest)

          request.checkSavedConsentFor = sinon.mock()
            .returns(Promise.resolve(false))
          request.response.render = sinon.mock()

          let renderConsentPage = sinon.spy(request, 'redirectToConsent')

          return LoginConsentRequest.obtainConsent(request)
            .catch(() => {})
            .then(() => {
              expect(renderConsentPage).to.have.been.called()
            })
        })

        it('should not have marked success', () => {
          let request = LoginConsentRequest.from(opAuthRequest)

          request.checkSavedConsentFor = sinon.mock()
            .returns(Promise.resolve(false))
          request.response.render = sinon.mock()

          return LoginConsentRequest.obtainConsent(request)
            .catch((opAuthRequest) => opAuthRequest)
            .then(opAuthRequest => {
              expect(opAuthRequest.consent).to.not.exist()
              expect(opAuthRequest.scope).to.not.exist()
            })
        })
      })
    })
  })

  describe.skip('redirectToConsent()', () => {
    it('should call res.redirect', async () => {
      const res = HttpMocks.createResponse()
      res.redirect = sinon.stub()

      let opAuthRequest = createOpAuthRequest({ res })
      opAuthRequest = Object.assign(opAuthRequest, {
        req: Object.assign(opAuthRequest.req, {
          session: {
            consentedOrigins: []
          }
        })
      })
      const request = LoginConsentRequest.from(opAuthRequest)
      await LoginConsentRequest.obtainConsent(request)
      expect(res.redirect).to.have.been.called()
    })
  })
})
