'use strict'

const fs = require('fs-extra')
const path = require('path')
const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect
chai.should()

const { UserCredentialStore } = require('../../lib/authentication/user-credential-store')
const dbPath = path.resolve(__dirname, '../db')

describe('UserCredentialStore (integration)', () => {
  beforeEach(() => {
    fs.removeSync(dbPath)
  })

  afterEach(() => {
    fs.removeSync(dbPath)
  })

  describe('initCollections()', () => {
    it('should create collection directories in db path', () => {
      const options = { path: dbPath }
      const store = UserCredentialStore.from(options)

      store.initCollections()

      expect(fs.existsSync(path.join(dbPath, 'users'))).to.be.true()
      expect(fs.existsSync(path.join(dbPath, 'users-by-email'))).to.be.true()
    })
  })

  describe('createUser()', () => {
    it('should create a user record and relevant index entries', () => {
      const options = { path: dbPath }
      const store = UserCredentialStore.from(options)
      store.initCollections()

      const user = {
        id: 'alice.example.com',
        email: 'alice@example.com'
      }
      const password = '12345'

      return store.createUser(user, password)
        .then(createdUser => {
          expect(createdUser.password).to.not.exist()
          expect(createdUser.hashedPassword).to.not.exist()

          const userFileName = store.backend.fileNameFor(user.id)
          const userFilePath = path.join(dbPath, 'users', userFileName)
          expect(fs.existsSync(userFilePath)).to.be.true()

          const emailIndexFile = store.backend.fileNameFor('alice%40example.com')
          const emailIndexPath = path.join(dbPath, 'users-by-email', emailIndexFile)
          expect(fs.existsSync(emailIndexPath)).to.be.true()
        })
    })
  })

  describe('updatePassword()', () => {
    it('should update the user record with the provided password', () => {
      const options = { path: dbPath }
      const store = UserCredentialStore.from(options)
      store.initCollections()

      const user = {
        id: 'alice.example.com'
      }
      const password = '12345'

      return store.updatePassword(user, password)
        .then(updatedUser => {
          expect(updatedUser.password).to.not.exist()
          expect(updatedUser.hashedPassword).to.not.exist()

          const userFileName = store.backend.fileNameFor(user.id)
          const userFilePath = path.join(dbPath, 'users', userFileName)
          expect(fs.existsSync(userFilePath)).to.be.true()
        })
    })
  })

  describe('findUser()', () => {
    it('loads a previously saved user', () => {
      const options = { path: dbPath, saltRounds: 2 }
      const store = UserCredentialStore.from(options)
      store.initCollections()

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
      const options = { path: dbPath, saltRounds: 2 }
      const store = UserCredentialStore.from(options)

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
      const options = { path: dbPath, saltRounds: 2 }
      const store = UserCredentialStore.from(options)

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
      const options = { path: dbPath, saltRounds: 2 }
      const store = UserCredentialStore.from(options)
      store.initCollections()

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
