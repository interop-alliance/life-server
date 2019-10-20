'use strict'

const chai = require('chai')
const expect = chai.expect
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.use(require('dirty-chai'))
chai.should()

const { AccountTemplate } = require('../../lib/account-mgmt/account-template')
const UserAccount = require('../../lib/account-mgmt/user-account')

describe('AccountTemplate', () => {
  describe('isTemplate()', () => {
    const template = new AccountTemplate()

    it('should recognize rdf files as templates', () => {
      expect(template.isTemplate('./file.ttl')).to.be.true()
      expect(template.isTemplate('./file.rdf')).to.be.true()
      expect(template.isTemplate('./file.html')).to.be.true()
      expect(template.isTemplate('./file.jsonld')).to.be.true()
    })

    it('should recognize files with template extensions as templates', () => {
      expect(template.isTemplate('./.acl')).to.be.true()
      expect(template.isTemplate('./.meta')).to.be.true()
      expect(template.isTemplate('./file.json')).to.be.true()
      expect(template.isTemplate('./file.acl')).to.be.true()
      expect(template.isTemplate('./file.meta')).to.be.true()
      expect(template.isTemplate('./file.hbs')).to.be.true()
      expect(template.isTemplate('./file.handlebars')).to.be.true()
    })

    it('should recognize reserved files with no extensions as templates', () => {
      expect(template.isTemplate('./web')).to.be.true()
    })

    it('should recognize arbitrary binary files as non-templates', () => {
      expect(template.isTemplate('./favicon.ico')).to.be.false()
      expect(template.isTemplate('./file')).to.be.false()
    })
  })

  describe('templateSubstitutionsFor()', () => {
    it('should init', () => {
      const userOptions = {
        username: 'alice',
        webId: 'https://alice.example.com/web#id',
        name: 'Alice Q.',
        email: 'alice@example.com'
      }
      const userAccount = UserAccount.from(userOptions)

      const substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)
      expect(substitutions.name).to.equal('Alice Q.')
      expect(substitutions.email).to.equal('alice@example.com')
      expect(substitutions.webId).to.equal('https://alice.example.com/web#id')
    })
  })
})
