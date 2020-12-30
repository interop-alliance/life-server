'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')

const { AccountManager } = require('../../src/accounts/account-manager')
const ServerHost = require('../../src/server/server-host')
const defaults = require('../../src/defaults')
const { CreateAccountRequest } = require('../../src/accounts/create-account-request')
const { testAccountManagerOptions } = require('../utils')

describe('CreateAccountRequest', () => {
  let host, options, accountManager
  let session, res

  beforeEach(() => {
    host = ServerHost.from({
      serverUri: 'https://example.com'
    })
    options = testAccountManagerOptions(host)
    accountManager = AccountManager.from(options)

    session = {}
    res = HttpMocks.createResponse()
  })

  describe('constructor()', () => {
    it('should create an instance with the given config', () => {
      const aliceData = { username: 'alice' }
      const userAccount = accountManager.userAccountFrom(aliceData)

      const options = { accountManager, userAccount, session, response: res }
      const request = new CreateAccountRequest(options)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.userAccount).to.equal(userAccount)
      expect(request.session).to.equal(session)
      expect(request.response).to.equal(res)
    })
  })

  describe('fromIncoming()', () => {
    it('should create an instance with the given config', () => {
      const aliceData = { username: 'alice', password: '123' }

      const userStore = {}
      const req = HttpMocks.createRequest({
        app: {
          locals: { storage: { users: userStore }, accountManager }
        },
        body: aliceData,
        session
      })

      const request = CreateAccountRequest.fromIncoming(req, res)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.userAccount.username).to.equal('alice')
      expect(request.session).to.equal(session)
      expect(request.response).to.equal(res)
      expect(request.password).to.equal(aliceData.password)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('createAccount()', () => {
    it('should return a 400 error if account already exists', done => {
      const locals = { authMethod: defaults.auth, accountManager, oidc: { users: {} } }
      const aliceData = {
        username: 'alice', password: '1234'
      }
      const req = HttpMocks.createRequest({ app: { locals }, body: aliceData })

      const request = CreateAccountRequest.fromIncoming(req, res)

      accountManager.accountExists = sinon.stub().returns(Promise.resolve(true))

      request.createAccount()
        .catch(err => {
          expect(err.status).to.equal(400)
          done()
        })
    })

    it('should return a 400 error if a username is invalid', () => {
      const locals = { authMethod: defaults.auth, accountManager, oidc: { users: {} } }

      accountManager.accountExists = sinon.stub().returns(Promise.resolve(false))

      const invalidUsernames = [
        '-',
        '-a',
        'a-',
        '9-',
        'alice--bob',
        'alice bob',
        'alice.bob'
      ]

      let invalidUsernamesCount = 0

      const requests = invalidUsernames.map((username) => {
        const aliceData = {
          username: username, password: '1234'
        }

        const req = HttpMocks.createRequest({ app: { locals }, body: aliceData })
        const request = CreateAccountRequest.fromIncoming(req, res)

        return request.createAccount()
          .then(() => {
            throw new Error('should not happen')
          })
          .catch(err => {
            invalidUsernamesCount++
            expect(err.message).to.match(/Invalid username/)
            expect(err.status).to.equal(400)
          })
      })

      return Promise.all(requests)
        .then(() => {
          expect(invalidUsernamesCount).to.eq(invalidUsernames.length)
        })
    })
  })

  describe.skip('sendResponse()', () => {
    it('should respond with a 302 Redirect', () => {
      const accountManager = AccountManager.from(options)
      const aliceData = { username: 'alice', password: '12345' }
      const req = HttpMocks.createRequest({
        app: { locals: { oidc: {}, accountManager } },
        body: aliceData,
        session
      })
      // const alice = accountManager.userAccountFrom(aliceData)

      const request = CreateAccountRequest.fromIncoming(req, res)

      // const result = request.sendResponse(alice)
      expect(request.response.statusCode).to.equal(302)
      // expect(result.username).to.equal('alice')
    })
  })
})
