'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const LogoutRequest = require('../../lib/authentication/handlers/logout-request')

describe('LogoutRequest', () => {
  it('should clear user session properties', async () => {
    const req = {
      session: {
        userId: 'https://alice.example.com/#me',
        accessToken: {},
        refreshToken: {},
        subject: {}
      }
    }
    const res = HttpMocks.createResponse()
    const request = LogoutRequest.fromIncoming(req, res)

    await request.handleGet()

    const session = req.session
    expect(session.userId).to.be.empty()
  })

  it('should redirect to /goodbye', async () => {
    const req = { session: {} }
    const res = HttpMocks.createResponse()
    const request = LogoutRequest.fromIncoming(req, res)

    await request.handleGet()
    expect(res.statusCode).to.equal(302)
    expect(res._getRedirectUrl()).to.equal('/goodbye')
  })
})
