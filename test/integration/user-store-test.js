'use strict'

const fs = require('fs-extra')
const path = require('path')
const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect
chai.should()

// const { UserCredentialStore } = require('../../src/authentication/user-credential-store')
const { testStorage } = require('../utils')
const dbPath = path.resolve(__dirname, '..', 'db')
const host = { serverUri: 'https://localhost:8443' }
const storage = testStorage(host, dbPath)

describe('UserCredentialStore (integration)', () => {
  beforeEach(() => {
    fs.removeSync(dbPath)
  })

  afterEach(() => {
    fs.removeSync(dbPath)
  })

  describe('createUser()', () => {
    it('should create a user record and relevant index entries', async () => {
      const store = storage.users

      const user = {
        id: 'alice.example.com',
        email: 'alice@example.com'
      }
      const password = '12345'

      await store.createUser(user, password)

      const storedUser = await store.backend.get(user.id)
      expect(storedUser).to.have.property('id', 'alice.example.com')
      expect(storedUser).to.have.property('email', 'alice@example.com')
      expect(storedUser).to.have.property('hashedPassword')

      const userByEmail = await store.backend.get(user.email)
      expect(userByEmail).to.exist()
      expect(userByEmail).to.have.property('@alias', 'alice.example.com')
    })
  })

  describe('updatePassword()', () => {
    it('should update the user record with the provided password', async () => {
      const store = storage.users

      const user = {
        id: 'alice.example.com'
      }
      const password = '54321'

      await store.updatePassword(user, password)

      const updatedUser = await store.findUser(user.id)

      const newPasswordMatches = await store.matchPassword(updatedUser, password)
      expect(newPasswordMatches).to.be.ok()
    })
  })

  describe('findUser()', () => {
    it('loads a previously saved user', () => {
      const store = storage.users

      const user = {
        id: 'alice.example.com',
        email: 'alice@example.com'
      }
      const password = '12345'

      return store.createUser(user, password)
        .then(() => {
          return store.findUser(user.id)
        })
        .then(foundUser => {
          expect(foundUser.id).to.equal(user.id)
          expect(foundUser.email).to.equal(user.email)
        })
    })
  })

  describe('hashing and matching passwords', () => {
    it('returns the user object when password matches', () => {
      const store = storage.users

      const plaintextPassword = '12345'
      const user = { id: 'alice.example.com' }

      return store.hashPassword(plaintextPassword)
        .then(hashedPassword => {
          expect(hashedPassword).to.exist()

          user.hashedPassword = hashedPassword

          return store.matchPassword(user, plaintextPassword)
        })
        .then(matchedUser => {
          expect(matchedUser).to.equal(user)
        })
    })

    it('returns null when password does not match', () => {
      const store = storage.users

      const user = {
        id: 'alice.example.com',
        hashedPassword: '12345'
      }
      const wrongPassword = '67890'

      return store.matchPassword(user, wrongPassword)
        .then(matchedUser => {
          expect(matchedUser).to.be.null()
        })
    })
  })
  describe('deleteUser()', () => {
    it('deletes a previously saved user', () => {
      const store = storage.users

      const user = {
        id: 'alice.example.com',
        email: 'alice@example.com'
      }
      const password = '12345'

      return store.createUser(user, password)
        .then(() => {
          return store.findUser(user.id)
        })
        .then(foundUser => {
          expect(foundUser.id).to.equal(user.id)
          expect(foundUser.email).to.equal(user.email)
        })
        .then(() => {
          return store.deleteUser(user)
        })
        .then(() => {
          return store.findUser(user.id)
        })
        .then(foundUser => {
          expect(foundUser).to.not.exist()
        })
    })
  })
})
