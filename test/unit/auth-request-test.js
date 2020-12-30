'use strict'

const chai = require('chai')
const expect = chai.expect
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()

const AuthRequest = require('../../src/authentication/handlers/auth-request')
const ServerHost = require('../../src/server/server-host')
const UserAccount = require('../../src/accounts/user-account')

describe('AuthRequest', () => {
  const host = ServerHost.from({ serverUri: 'https://localhost:8443' })

  describe('authorizeUrl()', () => {
    it('should return an /authorize url', () => {
      const request = new AuthRequest({ host })

      const authUrl = request.authorizeUrl()

      expect(authUrl.startsWith('https://localhost:8443/authorize')).to.be.true()
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
