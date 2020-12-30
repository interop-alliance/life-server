'use strict'

const path = require('path')
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.use(require('dirty-chai'))
chai.should()

const ServerHost = require('../../src/server/server-host')
const { AccountManager } = require('../../src/accounts/account-manager')
const EmailService = require('../../src/email-service')
const { testAccountManagerOptions } = require('../utils')

const templatePath = path.join(__dirname, '..', '..', 'src', 'templates', 'emails')

let host, accountManager, emailService

beforeEach(() => {
  const emailConfig = { auth: {}, sender: 'lfs@example.com' }
  emailService = new EmailService(templatePath, emailConfig)

  const mgrConfig = {
    emailService,
    authMethod: 'oidc'
  }

  host = ServerHost.from({
    serverUri: 'https://example.com',
    multiuser: true
  })
  const options = testAccountManagerOptions(host, mgrConfig)
  accountManager = AccountManager.from(options)
})

describe('Account Creation Welcome Email', () => {
  describe('accountManager.sendWelcomeEmail() (unit tests)', () => {
    it('should resolve to null if email service not set up', async () => {
      accountManager.emailService = null

      const userData = { name: 'Alice', username: 'alice', email: 'alice@alice.com' }
      const newUser = accountManager.userAccountFrom(userData)

      const result = await accountManager.sendWelcomeEmail(newUser)
      expect(result).to.not.be.ok()
    })

    it('should resolve to null if a new user has no email', async () => {
      const userData = { name: 'Alice', username: 'alice' }
      const newUser = accountManager.userAccountFrom(userData)

      const result = await accountManager.sendWelcomeEmail(newUser)
      expect(result).to.not.be.ok()
    })

    it('should send an email using the welcome template', () => {
      const sendWithTemplate = sinon
        .stub(accountManager.emailService, 'sendWithTemplate')
        .returns(Promise.resolve())

      const userData = { name: 'Alice', username: 'alice', email: 'alice@alice.com' }
      const newUser = accountManager.userAccountFrom(userData)

      const expectedEmailData = {
        webid: 'https://alice.example.com/web#id',
        to: 'alice@alice.com',
        name: 'Alice'
      }

      return accountManager.sendWelcomeEmail(newUser)
        .then(result => {
          expect(sendWithTemplate).to.be.calledWith('welcome', expectedEmailData)
        })
    })
  })
})
