'use strict'

const path = require('path')
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const SolidHost = require('../../lib/solid-host')
const AccountManager = require('../../lib/account-mgmt/account-manager')
const EmailService = require('../../lib/email-service')
const { testAccountManagerOptions } = require('../utils')

const templatePath = path.join(__dirname, '../../default-templates/emails')

let host, accountManager, emailService

beforeEach(() => {
  const emailConfig = { auth: {}, sender: 'solid@example.com' }
  emailService = new EmailService(templatePath, emailConfig)

  const mgrConfig = {
    emailService,
    authMethod: 'oidc'
  }

  host = SolidHost.from({
    serverUri: 'https://example.com',
    multiuser: true
  })
  const options = testAccountManagerOptions(host, mgrConfig)
  accountManager = AccountManager.from(options)
})

describe('Account Creation Welcome Email', () => {
  describe('accountManager.sendWelcomeEmail() (unit tests)', () => {
    it('should resolve to null if email service not set up', () => {
      accountManager.emailService = null

      let userData = { name: 'Alice', username: 'alice', email: 'alice@alice.com' }
      let newUser = accountManager.userAccountFrom(userData)

      return accountManager.sendWelcomeEmail(newUser)
        .then(result => {
          expect(result).to.be.null
        })
    })

    it('should resolve to null if a new user has no email', () => {
      let userData = { name: 'Alice', username: 'alice' }
      let newUser = accountManager.userAccountFrom(userData)

      return accountManager.sendWelcomeEmail(newUser)
        .then(result => {
          expect(result).to.be.null
        })
    })

    it('should send an email using the welcome template', () => {
      let sendWithTemplate = sinon
        .stub(accountManager.emailService, 'sendWithTemplate')
        .returns(Promise.resolve())

      let userData = { name: 'Alice', username: 'alice', email: 'alice@alice.com' }
      let newUser = accountManager.userAccountFrom(userData)

      let expectedEmailData = {
        webid: 'https://alice.example.com/profile/card#me',
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
