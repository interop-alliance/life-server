'use strict'

const chai = require('chai')
const expect = chai.expect
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
chai.should()

const { LdpTarget } = require('../../src/data-storage/ldp-target')

describe('LdpTarget', () => {
  describe('parent', () => {
    it('should return null for root container', () => {
      const target = new LdpTarget({ name: '/' })

      expect(target.parent).to.be.null()
    })

    it('should return url to parent container, if container but not root', () => {
      const target = new LdpTarget({
        name: '/one/two/', url: 'https://test.com/one/two/'
      })

      expect(target.parent).to.equal('https://test.com/one/')
    })

    it('should return url to parent container, if resource (not container)', () => {
      const target = new LdpTarget({
        name: '/one/test.txt', url: 'https://test.com/one/text.txt'
      })

      expect(target.parent).to.equal('https://test.com/one/')
    })
  })
})
