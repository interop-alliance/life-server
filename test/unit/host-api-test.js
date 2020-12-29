'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const api = require('../../src/authentication/host-api')

describe('Host API', () => {
  describe('authenticatedUser', () => {
    it('should return null if session has no user id set', () => {
      const authRequest = { req: { session: {} } }

      expect(api.authenticatedUser(authRequest)).to.be.null()
    })

    it('should return true if session has user id set', () => {
      const aliceWebId = 'https://alice.example.com/#me'
      const authRequest = {
        req: { session: { userId: aliceWebId } }
      }

      expect(api.authenticatedUser(authRequest)).to.equal(aliceWebId)
    })
  })

  describe('initSubjectClaim', () => {
    it('should init the request subject claim from session user id', () => {
      const aliceWebId = 'https://alice.example.com/#me'
      const authRequest = {}

      api.initSubjectClaim(authRequest, aliceWebId)

      expect(authRequest.subject._id).to.equal(aliceWebId)
    })
  })

  describe('authenticate', () => {
    let api

    beforeEach(() => {
      // re-import because we're going to be mocking methods
      api = require('../../src/authentication/host-api')
    })

    it('should initialize subject claim and return request if user is logged in', () => {
      const aliceWebId = 'https://alice.example.com/#me'
      const session = { userId: aliceWebId }
      let authRequest = {
        req: HttpMocks.createRequest({ session }),
        res: HttpMocks.createResponse(),
        host: {},
        provider: {
          issuer: 'https://example.com'
        }
      }

      authRequest = api.authenticate(authRequest)

      expect(authRequest.subject._id).to.equal(aliceWebId)
    })

    it('should redirect to login if user is not already logged in', () => {
      const query = {
        param1: 'value1', param2: 'value2'
      }
      const res = HttpMocks.createResponse()

      const authRequest = {
        req: { session: { }, query },
        host: {},
        provider: {
          issuer: 'https://example.com'
        },
        res
      }

      try {
        api.authenticate(authRequest)
      } catch (exception) {
        expect(authRequest.res._getRedirectUrl())
          .to.equal('https://example.com/login?param1=value1&param2=value2')

        expect(exception.message).to.equal('User redirected to login')
      }
    })
  })

  describe('obtainConsent()', () => {
    it('should return the auth request object', () => {
      const authRequest = {
        req: { session: { } }, host: {}
      }

      return api.obtainConsent(authRequest)
        .then(result => {
          expect(result).to.equal(authRequest)
        })
    })
  })
})
