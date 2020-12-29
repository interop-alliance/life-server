'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.should()

const { UserCredentialStore } = require('../../src/authentication/user-credential-store')

describe('UserCredentialStore', () => {
  describe('from()', () => {
    it('should initialize a UserCredentialStore instance from options', () => {
      const backend = {}

      const store = UserCredentialStore.from({ backend })

      expect(store.backend).to.equal(backend)
    })
  })

  describe('createUser()', () => {
    let store

    beforeEach(() => {
      store = UserCredentialStore.from({ backend: {} })
    })

    it('should throw an error if no user is provided', (done) => {
      const password = '12345'

      store.createUser(null, password)
        .catch(error => {
          expect(error.message).to.equal('No user id provided to user store')
          done()
        })
    })

    it('should throw an error if no user id is provided', (done) => {
      const user = {}
      const password = '12345'

      store.createUser(user, password)
        .catch(error => {
          expect(error.message).to.equal('No user id provided to user store')
          done()
        })
    })

    it('should throw an error if no password is provided', (done) => {
      const user = { id: 'abc' }

      store.createUser(user, null)
        .catch(error => {
          expect(error.message).to.equal('No password provided')
          done()
        })
    })

    it('should create a hashed password', () => {
      const user = { id: 'abc' }
      const password = '12345'

      store.backend.put = sinon.stub().resolves()
      store.hashPassword = sinon.spy(store, 'hashPassword')

      return store.createUser(user, password)
        .then(() => {
          expect(store.hashPassword).to.have.been.calledWith(password)
        })
    })

    it('should save the user record', () => {
      const user = { id: 'abc' }
      const password = '12345'

      store.backend.put = sinon.stub().resolves()
      store.saveUser = sinon.spy(store, 'saveUser')

      return store.createUser(user, password)
        .then(() => {
          expect(store.saveUser).to.have.been.calledWith(user)
        })
    })

    it('should create an entry in the users-by-email index', () => {
      const user = { id: 'abc', email: 'alice@example.com' }
      const password = '12345'

      store.backend.put = sinon.stub().resolves()
      store.saveAliasUserRecord = sinon.spy(store, 'saveAliasUserRecord')

      return store.createUser(user, password)
        .then(() => {
          expect(store.saveAliasUserRecord).to
            .have.been.calledWith(user.email, user.id)
        })
    })
  })

  describe('findUser', () => {
    let store

    beforeEach(() => {
      store = UserCredentialStore.from({ backend: {} })
    })

    it('should look up user record by user id', () => {
      const userId = 'alice.solidtest.space/web#id'
      const user = {}

      store.backend.get = sinon.stub().resolves(user)

      return store.findUser(userId)
        .then(fetchedUser => {
          expect(fetchedUser).to.equal(user)

          expect(store.backend.get).to.have.been
            .calledWith('alice.solidtest.space/web#id')
        })
    })
  })

  describe('deleteUser', () => {
    let store

    beforeEach(() => {
      store = UserCredentialStore.from({ backend: {} })
    })

    it('should call backend.del with user id and email', () => {
      const userId = 'alice.solidtest.space/web#id'
      const email = 'alice@example.com'

      store.backend.remove = sinon.stub().resolves()

      return store.deleteUser({ id: userId, email: email })
        .then(() => {
          expect(store.backend.remove).to.have.been.calledWith(email)
          expect(store.backend.remove).to.have.been.calledWith(userId)
        })
    })
  })
})
