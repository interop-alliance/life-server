'use strict'
const { getPossibleACLs } = require('../../src/authorization/ldp-wac')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

describe('ldp-wac unit test', () => {
  describe('getPossibleACLs', () => {
    it('returns all possible ACLs of the root', () => {
      expect(getPossibleACLs({ url: 'http://ex.org/' })).to.deep.equal([
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of a regular file', () => {
      expect(getPossibleACLs({ url: 'http://ex.org/abc/def/ghi' })).to.deep.equal([
        'http://ex.org/abc/def/ghi.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of an ACL file', () => {
      expect(getPossibleACLs({ url: 'http://ex.org/abc/def/ghi.acl' })).to.deep.equal([
        'http://ex.org/abc/def/ghi.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of a directory', () => {
      expect(getPossibleACLs({ url: 'http://ex.org/abc/def/ghi/' })).to.deep.equal([
        'http://ex.org/abc/def/ghi/.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })
  })
})
