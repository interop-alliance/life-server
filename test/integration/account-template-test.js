'use strict'

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
chai.should()

const ServerHost = require('../../lib/server-host')
const { AccountTemplate } = require('../../lib/account-mgmt/account-template')
const { testStorage } = require('../utils')

const templatePath = path.join(__dirname, '../../default-templates/new-account')
const accountPath = path.join(__dirname, '../resources/new-account')

const host = ServerHost.from({
  serverUri: 'https://example.com',
  root: accountPath
})
const storage = testStorage(host)

describe('AccountTemplate', () => {
  beforeEach(() => {
    fs.removeSync(accountPath)
  })

  afterEach(() => {
    fs.removeSync(accountPath)
  })

  describe('provisionAccountFrom()', () => {
    it('should process all the files in an account', async () => {
      const substitutions = {
        webId: 'https://example.com/#me',
        email: 'alice@example.com',
        name: 'Alice Q.'
      }
      const template = new AccountTemplate({
        substitutions, accountStorage: storage.accountStorage
      })

      await template.provisionAccountFrom({
        templatePath, accountUrl: 'https://example.com'
      })

      const profile = fs.readFileSync(path.join(accountPath, '/web'), 'utf8')
      expect(profile).to.include('"Alice Q."')

      const rootAcl = fs.readFileSync(path.join(accountPath, '.acl'), 'utf8')
      expect(rootAcl).to.include('<mailto:alice@')
      expect(rootAcl).to.include('<https://example.com/#me>')
    })
  })
})
