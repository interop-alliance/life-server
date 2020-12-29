'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const { expect } = chai
const UserAccount = require('../../src/account-mgmt/user-account')

describe('UserAccount', () => {
  describe('from()', () => {
    it('initializes the object with passed in options', () => {
      const options = {
        username: 'alice',
        webId: 'https://alice.com/#me',
        name: 'Alice',
        email: 'alice@alice.com'
      }

      const account = UserAccount.from(options)
      expect(account.username).to.equal(options.username)
      expect(account.webId).to.equal(options.webId)
      expect(account.name).to.equal(options.name)
      expect(account.email).to.equal(options.email)
    })
  })

  describe('id getter', () => {
    it('should return null if webId is null', () => {
      const account = new UserAccount()

      expect(account.id).to.not.be.ok()
    })

    it('should return the WebID uri minus the protocol and slashes', () => {
      const webId = 'https://alice.example.com/web#id'
      const account = new UserAccount({ webId })

      expect(account.id).to.equal('alice.example.com/web#id')
    })
  })
})
