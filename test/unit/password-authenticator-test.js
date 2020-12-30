'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()

const { PasswordAuthenticator } = require('../../src/authentication/authenticator')

const ServerHost = require('../../src/server-host')
const { AccountManager } = require('../../src/account-mgmt/account-manager')
const { testAccountManagerOptions } = require('../utils')

const mockUserCredentialStore = {
  findUser: () => { return Promise.resolve(true) },
  matchPassword: (user, password) => { return Promise.resolve(user) }
}

const host = ServerHost.from({
  serverUri: 'https://localhost:8443'
})
const options = testAccountManagerOptions(host)
const accountManager = AccountManager.from(options)

describe('PasswordAuthenticator', () => {
  describe('fromParams()', () => {
    const req = {
      body: { username: 'alice', password: '12345' }
    }
    const options = { storage: { users: mockUserCredentialStore }, accountManager }

    it('should return a PasswordAuthenticator instance', () => {
      const pwAuth = PasswordAuthenticator.fromParams(req, options)

      expect(pwAuth.userStore).to.equal(mockUserCredentialStore)
      expect(pwAuth.accountManager).to.equal(accountManager)
      expect(pwAuth.username).to.equal('alice')
      expect(pwAuth.password).to.equal('12345')
    })

    it('should init with undefined username and password if no body is provided', () => {
      const req = {}

      const pwAuth = PasswordAuthenticator.fromParams(req, {})

      expect(pwAuth.username).to.be.undefined()
      expect(pwAuth.password).to.be.undefined()
    })
  })

  describe('validate()', () => {
    it('should throw a 400 error if no username was provided', done => {
      const options = { username: null, password: '12345' }
      const pwAuth = new PasswordAuthenticator(options)

      try {
        pwAuth.validate()
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        expect(error.message).to.equal('Username required')
        done()
      }
    })

    it('should throw a 400 error if no password was provided', done => {
      const options = { username: 'alice', password: null }
      const pwAuth = new PasswordAuthenticator(options)

      try {
        pwAuth.validate()
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        expect(error.message).to.equal('Password required')
        done()
      }
    })
  })

  describe('findValidUser()', () => {
    it('should throw a 400 if no valid user is found in the user store', done => {
      const options = {
        username: 'alice',
        password: '1234',
        accountManager
      }
      const pwAuth = new PasswordAuthenticator(options)

      pwAuth.userStore = {
        findUser: () => { return Promise.resolve(false) }
      }

      pwAuth.findValidUser()
        .catch(error => {
          expect(error.statusCode).to.equal(400)
          expect(error.message).to.equal('No user found for that username')
          done()
        })
    })

    it('should throw a 400 if user is found but password does not match', done => {
      const options = {
        username: 'alice',
        password: '1234',
        accountManager
      }
      const pwAuth = new PasswordAuthenticator(options)

      pwAuth.userStore = {
        findUser: () => { return Promise.resolve(true) },
        matchPassword: () => { return Promise.resolve(false) }
      }

      pwAuth.findValidUser()
        .catch(error => {
          expect(error.statusCode).to.equal(400)
          expect(error.message).to.equal('User found but no password match')
          done()
        })
    })

    it('should return a valid user if one is found and password matches', () => {
      const webId = 'https://alice.example.com/#me'
      const validUser = { username: 'alice', webId }
      const options = {
        username: 'alice',
        password: '1234',
        accountManager
      }
      const pwAuth = new PasswordAuthenticator(options)

      pwAuth.userStore = {
        findUser: () => { return Promise.resolve(validUser) },
        matchPassword: (user, password) => { return Promise.resolve(user) }
      }

      return pwAuth.findValidUser()
        .then(foundUser => {
          expect(foundUser.webId).to.equal(webId)
        })
    })

    describe('in Multi User mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://example.com',
        multiuser: true
      })
      const accountManager = AccountManager.from(testAccountManagerOptions(host))

      const aliceRecord = { webId: 'https://alice.example.com/web#id' }
      const mockUserCredentialStore = {
        findUser: sinon.stub().resolves(aliceRecord),
        matchPassword: (user, password) => { return Promise.resolve(user) }
      }

      it('should load user from store if provided with username', () => {
        const options = {
          username: 'alice',
          password: '1234',
          storage: { users: mockUserCredentialStore },
          accountManager
        }
        const pwAuth = new PasswordAuthenticator(options)

        const userStoreKey = 'alice.example.com/web#id'

        return pwAuth.findValidUser()
          .then(() => {
            expect(mockUserCredentialStore.findUser).to.be.calledWith(userStoreKey)
          })
      })

      it('should load user from store if provided with WebID', () => {
        const webId = 'https://alice.example.com/web#id'
        const options = {
          username: webId,
          password: '1234',
          storage: { users: mockUserCredentialStore },
          accountManager
        }
        const pwAuth = new PasswordAuthenticator(options)

        const userStoreKey = 'alice.example.com/web#id'

        return pwAuth.findValidUser()
          .then(() => {
            expect(mockUserCredentialStore.findUser).to.be.calledWith(userStoreKey)
          })
      })
    })

    describe('in Single User mode', () => {
      const host = ServerHost.from({
        serverUri: 'https://localhost:8443',
        multiuser: false
      })
      const accountManager = AccountManager.from(testAccountManagerOptions(host))

      const aliceRecord = { webId: 'https://localhost:8443/web#id' }
      const mockUserCredentialStore = {
        findUser: sinon.stub().resolves(aliceRecord),
        matchPassword: (user, password) => { return Promise.resolve(user) }
      }

      it('should load user from store if provided with username', () => {
        const options = {
          username: 'admin',
          password: '1234',
          storage: { users: mockUserCredentialStore },
          accountManager
        }
        const pwAuth = new PasswordAuthenticator(options)

        const userStoreKey = 'localhost:8443/web#id'

        return pwAuth.findValidUser()
          .then(() => {
            expect(mockUserCredentialStore.findUser).to.be.calledWith(userStoreKey)
          })
      })

      it('should load user from store if provided with WebID', () => {
        const webId = 'https://localhost:8443/web#id'
        const options = {
          username: webId,
          password: '1234',
          storage: { users: mockUserCredentialStore },
          accountManager
        }
        const pwAuth = new PasswordAuthenticator(options)

        const userStoreKey = 'localhost:8443/web#id'

        return pwAuth.findValidUser()
          .then(() => {
            expect(mockUserCredentialStore.findUser).to.be.calledWith(userStoreKey)
          })
      })
    })
  })
})
