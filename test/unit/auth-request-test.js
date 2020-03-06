'use strict'

const chai = require('chai')
const expect = chai.expect
// const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()
// const HttpMocks = require('node-mocks-http')
const { URL } = require('url')

const AuthRequest = require('../../lib/authentication/auth-request')
const ServerHost = require('../../lib/server-host')
const UserAccount = require('../../lib/account-mgmt/user-account')

describe('AuthRequest', () => {
  function testAuthQueryParams () {
    const body = {}
    body.response_type = 'code'
    body.scope = 'openid'
    body.client_id = 'client1'
    body.redirect_uri = 'https://redirect.example.com/'
    body.state = '1234'
    body.nonce = '5678'
    body.display = 'page'

    return body
  }

  const host = ServerHost.from({ serverUri: 'https://localhost:8443' })

  describe('extractAuthParams()', () => {
    it('should initialize the auth url query object from params', () => {
      const body = testAuthQueryParams()
      body.other_key = 'whatever'
      const req = { body, method: 'POST' }

      const extracted = AuthRequest.extractAuthParams(req)

      for (const param of AuthRequest.AUTH_QUERY_PARAMS) {
        expect(extracted[param]).to.equal(body[param])
      }

      // make sure *only* the listed params were copied
      expect(extracted.other_key).to.not.exist()
    })

    it('should return empty params with no request body present', () => {
      const req = { method: 'POST' }

      expect(AuthRequest.extractAuthParams(req)).to.eql({})
    })
  })

  describe('authorizeUrl()', () => {
    it('should return an /authorize url', () => {
      const request = new AuthRequest({ host })

      const authUrl = request.authorizeUrl()

      expect(authUrl.startsWith('https://localhost:8443/authorize')).to.be.true()
    })

    it('should pass through relevant auth query params from request body', () => {
      const body = testAuthQueryParams()
      const req = { body, method: 'POST' }

      const request = new AuthRequest({ host })
      request.authQueryParams = AuthRequest.extractAuthParams(req)

      const authUrl = request.authorizeUrl()

      const parsedUrl = new URL(authUrl)

      for (const param in body) {
        expect(body[param]).to.equal(parsedUrl.searchParams.get(param))
      }
    })
  })

  describe('initUserSession()', () => {
    it('should initialize the request session', () => {
      const webId = 'https://alice.example.com/#me'
      const alice = UserAccount.from({ username: 'alice', webId })
      const session = {}

      const request = new AuthRequest({ session })

      request.initUserSession(alice)

      expect(request.session.userId).to.equal(webId)
      const subject = request.session.subject
      expect(subject._id).to.equal(webId)
    })
  })
})
