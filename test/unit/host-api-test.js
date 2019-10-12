'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const api = require('../../lib/authentication/host-api')

describe('Host API', () => {
  describe('authenticatedUser', () => {
    it('should return null if session has no user id set', () => {
      let authRequest = { req: { session: {} } }

      expect(api.authenticatedUser(authRequest)).to.be.null()
    })

    it('should return true if session has user id set', () => {
      let aliceWebId = 'https://alice.example.com/#me'
      let authRequest = {
        req: { session: { userId: aliceWebId } }
      }

      expect(api.authenticatedUser(authRequest)).to.equal(aliceWebId)
    })
  })

  describe('initSubjectClaim', () => {
    it('should init the request subject claim from session user id', () => {
      let aliceWebId = 'https://alice.example.com/#me'
      let authRequest = {}

      api.initSubjectClaim(authRequest, aliceWebId)

      expect(authRequest.subject['_id']).to.equal(aliceWebId)
    })
  })

  describe('authenticate', () => {
    let api

    beforeEach(() => {
      // re-import because we're going to be mocking methods
      api = require('../../lib/authentication/host-api')
    })

    it('should initialize subject claim and return request if user is logged in', () => {
      let aliceWebId = 'https://alice.example.com/#me'
      let session = { userId: aliceWebId }
      let authRequest = {
        req: HttpMocks.createRequest({ session }),
        res: HttpMocks.createResponse(),
        host: {}
      }

      authRequest = api.authenticate(authRequest)

      expect(authRequest.subject['_id']).to.equal(aliceWebId)
    })

    it('should redirect to login if user is not already logged in', () => {
      let query = {
        'param1': 'value1', 'param2': 'value2'
      }
      let res = HttpMocks.createResponse()

      let authRequest = {
        req: { session: { }, query }, host: {}, res
      }

      try {
        api.authenticate(authRequest)
      } catch (exception) {
        expect(authRequest.res._getRedirectUrl())
          .to.equal('/login?param1=value1&param2=value2')

        expect(exception.message).to.equal('User redirected to login')
      }
    })
  })

  describe('obtainConsent()', () => {
    it('should return the auth request object', () => {
      let authRequest = {
        req: { session: { } }, host: {}
      }

      return api.obtainConsent(authRequest)
        .then(result => {
          expect(result).to.equal(authRequest)
        })
    })
  })
})
