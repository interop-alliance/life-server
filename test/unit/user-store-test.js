'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const assert = chai.assert
const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.should()

const UserStore = require('../../lib/authentication/user-store')

describe('UserStore', () => {
  describe('backendOptionsFor()', () => {
    it('should return a backend options object', () => {
      let path = './db'
      let options = UserStore.backendOptionsFor(path)

      expect(options.path).to.equal(path)
      expect(options.collections).to.deep.equal(['users', 'users-by-email'])
    })
  })

  describe('from()', () => {
    it('should initialize a UserStore instance from options', () => {
      let path = './db'
      let options = { path }

      let store = UserStore.from(options)

      expect(store.saltRounds).to.equal(UserStore.DEFAULT_SALT_ROUNDS)
      expect(store.backend.path).to.equal(path)
      expect(store.backend).to.respondTo('put')
    })
  })

  describe('normalizeEmailKey()', () => {
    it('should return a null if no email is passed in', () => {
      let key = UserStore.normalizeEmailKey(null)
      expect(key).to.be.null()
    })

    it('should uri-escape an email that is passed in', () => {
      let key = UserStore.normalizeEmailKey('alice@example.com')
      expect(key).to.equal('alice%40example.com')
    })
  })

  describe('normalizeIdKey()', () => {
    it('should return a null if no id is passed in', () => {
      let key = UserStore.normalizeIdKey(null)
      expect(key).to.be.null()
    })

    it('should cast an integer id to string', () => {
      let key = UserStore.normalizeIdKey(10)
      expect(key).to.equal('10')
    })

    it('should uri-escape an email that is passed in', () => {
      let key = UserStore.normalizeIdKey('https://alice.example.com/#me')
      expect(key).to.equal('https%3A%2F%2Falice.example.com%2F%23me')
    })
  })

  describe('createUser()', () => {
    let store

    beforeEach(() => {
      store = UserStore.from({ path: './db' })
    })

    it('should throw an error if no user is provided', (done) => {
      let password = '12345'

      store.createUser(null, password)
        .catch(error => {
          expect(error.message).to.equal('No user id provided to user store')
          done()
        })
    })

    it('should throw an error if no user id is provided', (done) => {
      let user = {}
      let password = '12345'

      store.createUser(user, password)
        .catch(error => {
          expect(error.message).to.equal('No user id provided to user store')
          done()
        })
    })

    it('should throw an error if no password is provided', (done) => {
      let user = { id: 'abc' }

      store.createUser(user, null)
        .catch(error => {
          expect(error.message).to.equal('No password provided')
          done()
        })
    })

    it('should create a hashed password', () => {
      let user = { id: 'abc' }
      let password = '12345'

      store.backend.put = sinon.stub().resolves()
      store.hashPassword = sinon.spy(store, 'hashPassword')

      return store.createUser(user, password)
        .then(() => {
          expect(store.hashPassword).to.have.been.calledWith(password)
        })
    })

    it('should save the user record', () => {
      let user = { id: 'abc' }
      let password = '12345'

      store.backend.put = sinon.stub().resolves()
      store.saveUser = sinon.spy(store, 'saveUser')

      return store.createUser(user, password)
        .then(() => {
          expect(store.saveUser).to.have.been.calledWith(user)
        })
    })

    it('should create an entry in the users-by-email index', () => {
      let user = { id: 'abc', email: 'alice@example.com' }
      let password = '12345'

      store.backend.put = sinon.stub().resolves()
      store.saveUserByEmail = sinon.spy(store, 'saveUserByEmail')

      return store.createUser(user, password)
        .then(() => {
          expect(store.saveUserByEmail).to.have.been.calledWith(user)
        })
    })

    it('should create a linking user record in case of external web id', async () => {
      const user = {
        id: 'example.com/profile#me',
        externalWebId: 'https://example.com/profile#me',
        localAccountId: 'alice.solidtest.space/profile/card#me'
      }
      const password = '12345'

      store.backend.put = (coll, key, value) => Promise.resolve(value)

      store.saveAliasUserRecord = (localAccountId, userId) => Promise.resolve()

      sinon.spy(store, 'saveAliasUserRecord')

      // const externalKey = 'example.com%2Fprofile%23me'
      // const localAccountKey = 'alice.solidtest.space%2Fprofile%2Fcard%23me'

      await store.createUser(user, password)

      // Make sure alice.solidtest.space -> example.com link is created
      expect(store.saveAliasUserRecord).to.have.been
        .calledWith(user.localAccountId, user.id)
    })
  })

  describe('findUser', () => {
    let store

    beforeEach(() => {
      store = UserStore.from({ path: './db' })
    })

    it('should look up user record by normalized user id', () => {
      let userId = 'alice.solidtest.space/profile/card#me'
      let user = {}

      store.backend.get = sinon.stub().resolves(user)

      return store.findUser(userId)
        .then(fetchedUser => {
          expect(fetchedUser).to.equal(user)

          expect(store.backend.get).to.have.been
            .calledWith('users', 'alice.solidtest.space%2Fprofile%2Fcard%23me')
        })
    })

    it('should look up user record via an alias record', () => {
      let aliasId = 'alice.solidtest.space/profile/card#me'
      let aliasKey = 'alice.solidtest.space%2Fprofile%2Fcard%23me'
      let aliasRecord = { link: 'example.com/profile#me' }

      let userRecord = { name: 'Alice' }

      store.backend.get = sinon.stub()

      store.backend.get.withArgs('users', 'example.com%2Fprofile%23me')
        .resolves(userRecord)

      store.backend.get.withArgs('users', aliasKey)
        .resolves(aliasRecord)

      return store.findUser(aliasId)
        .then(fetchedUser => {
          expect(fetchedUser).to.equal(userRecord)
        })
    })
  })

  describe('deleteUser', () => {
    let store

    beforeEach(() => {
      store = UserStore.from({ path: './db' })
    })

    it('should call backend.del with normalized user id and email', () => {
      let userId = 'alice.solidtest.space/profile/card#me'
      let email = 'alice@example.com'

      store.backend.del = sinon.stub()

      return store.deleteUser({ id: userId, email: email })
        .then(() => {
          expect(store.backend.del).to.have.been.calledWith('users', UserStore.normalizeIdKey(userId))
          expect(store.backend.del).to.have.been.calledWith('users-by-email', UserStore.normalizeEmailKey(email))
        })
    })

    it('should call backend.del with normalized user id but no email', () => {
      let userId = 'alice.solidtest.space/profile/card#me'

      store.backend.del = sinon.stub()

      return store.deleteUser({ id: userId })
        .then(() => {
          expect(store.backend.del).to.have.been.calledWith('users', UserStore.normalizeIdKey(userId))
          expect(store.backend.del).to.not.have.been.calledWith('users-by-email', UserStore.normalizeEmailKey())
        })
        .then(
          () => Promise.reject(new Error('Expected method to reject.')),
          err => assert.instanceOf(err, Error)
        )
    })
  })
})
