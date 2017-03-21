'use strict'

const path = require('path')
const chai = require('chai')
const expect = chai.expect
// const sinon = require('sinon')
// const sinonChai = require('sinon-chai')
// chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')

const LDP = require('../../lib/ldp')
const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')
const testAccountsDir = path.join(__dirname, '..', 'resources', 'accounts')

const api = require('../../lib/api/accounts/user-accounts')

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('api/accounts/user-accounts', () => {
  describe('newCertificate()', () => {
    describe('in multi user mode', () => {
      let multiUser = true
      let store = new LDP({ root: testAccountsDir, idp: multiUser })

      it('should throw a 400 error if spkac param is missing', done => {
        let options = { host, store, multiUser, authMethod: 'tls' }
        let accountManager = AccountManager.from(options)

        let req = {
          body: {
            webid: 'https://alice.example.com/#me'
          },
          session: { userId: 'https://alice.example.com/#me' },
          get: () => { return 'https://example.com' }
        }
        let res = HttpMocks.createResponse()

        let newCertificate = api.newCertificate(accountManager)

        newCertificate(req, res, (err) => {
          expect(err.status).to.equal(400)
          expect(err.message).to.equal('Missing spkac parameter')
          done()
        })
      })
    })
  })
})
