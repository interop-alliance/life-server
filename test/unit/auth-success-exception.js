'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
chai.should()
const expect = chai.expect

const AuthResponseSent = require('../../lib/authentication/errors/auth-response-sent')

describe('AuthResponseSent', () => {
  it('should create a handled error', () => {
    const authSuccess = new AuthResponseSent()

    expect(authSuccess.handled).to.be.true()
  })
})
