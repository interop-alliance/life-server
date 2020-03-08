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

const DeleteAccountRequest = require('../../lib/account-mgmt/delete-account-request')
const { AccountManager } = require('../../lib/account-mgmt/account-manager')
const ServerHost = require('../../lib/server-host')
const { testAccountManagerOptions } = require('../utils')

let host, accountManager

describe('DeleteAccountRequest', () => {
  beforeEach(() => {
    host = ServerHost.from({
      serverUri: 'https://example.com',
      multiuser: true
    })
    accountManager = AccountManager.from(testAccountManagerOptions(host))
  })

  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const options = {
        response: res,
        username: 'alice'
      }

      const request = new DeleteAccountRequest(options)

      expect(request.response).to.equal(res)
      expect(request.username).to.equal(options.username)
    })
  })

  describe('fromIncoming()', () => {
    it('should return a request instance from options', () => {
      const username = 'alice'
      const accountManager = {}

      const req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      const res = HttpMocks.createResponse()

      const request = DeleteAccountRequest.fromIncoming(req, res)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.username).to.equal(username)
      expect(request.response).to.equal(res)
    })
  })

  describe('handleGet()', () => {
    it('should render a delete account form', async () => {
      const username = 'alice'
      const accountManager = { multiuser: true }

      const req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      const res = HttpMocks.createResponse()
      res.render = sinon.stub()

      const request = DeleteAccountRequest.fromIncoming(req, res)
      await request.handleGet()

      expect(res.render).to.have.been.calledWith('account/delete',
        { error: undefined, multiuser: true })
    })
  })

  describe('handlePost()', () => {
    it('should handle the post request', async () => {
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendDeleteAccountEmail = sinon.stub().resolves()
      accountManager.accountExists = sinon.stub().resolves(true)

      const username = 'alice'
      const response = HttpMocks.createResponse()
      response.render = sinon.stub()

      const options = { accountManager, username, response }
      const request = new DeleteAccountRequest(options)

      sinon.spy(request, 'error')

      await request.handlePost()

      expect(accountManager.loadAccountRecoveryEmail).to.have.been.called()
      expect(response.render).to.have.been.calledWith('account/delete-link-sent')
      expect(request.error).to.not.have.been.called()
    })
  })

  describe('validate()', () => {
    it('should throw an error if username is missing in multi-user mode', () => {
      const request = new DeleteAccountRequest({ accountManager })

      expect(() => request.validate()).to.throw(/Username required/)
    })

    it('should not throw an error if username is missing in single user mode', () => {
      accountManager.host.multiuser = false
      const request = new DeleteAccountRequest({ accountManager })

      expect(() => request.validate()).to.not.throw()
    })
  })

  describe('loadUser()', () => {
    it('should return a UserAccount instance based on username', async () => {
      accountManager.accountExists = sinon.stub().resolves(true)
      const username = 'alice'

      const options = { accountManager, username }
      const request = new DeleteAccountRequest(options)

      const account = await request.loadUser()
      expect(account.webId).to.equal('https://alice.example.com/web#id')
    })

    it('should throw an error if the user does not exist', done => {
      accountManager.accountExists = sinon.stub().resolves(false)
      const username = 'alice'

      const options = { accountManager, username }
      const request = new DeleteAccountRequest(options)

      request.loadUser()
        .catch(error => {
          expect(error.message).to.equal('Account not found for that username')
          done()
        })
    })
  })
})
