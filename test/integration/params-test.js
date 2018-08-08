var assert = require('chai').assert
var supertest = require('supertest')
// Helper functions for the FS
var rm = require('../utils').rm
var write = require('../utils').write
var read = require('../utils').read

var ldnode = require('../../index')

describe('LDNODE params', function () {
  describe('suffixMeta', function () {
    describe('not passed', function () {
      it('should fallback on .meta', function () {
        var ldp = ldnode({ webid: false })
        assert.equal(ldp.locals.ldp.suffixMeta, '.meta')
      })
    })
  })

  describe('suffixAcl', function () {
    describe('not passed', function () {
      it('should fallback on .acl', function () {
        var ldp = ldnode({ webid: false })
        assert.equal(ldp.locals.ldp.suffixAcl, '.acl')
      })
    })
  })

  describe('root', function () {
    describe('not passed', function () {
      var ldp = ldnode({ webid: false })

      it('should fallback on default value', function () {
        assert.equal(ldp.locals.ldp.root, './data/')
      })
    })

    describe('passed', function () {
      var ldp = ldnode({root: './test/resources/', webid: false})
      var server = supertest(ldp)

      it('should fallback on current working directory', function () {
        assert.equal(ldp.locals.ldp.root, './test/resources/')
      })

      it('should find resource in correct path', function (done) {
        write(
          '<#current> <#temp> 123 .',
          'sampleContainer/example.ttl')

        // This assumes npm test is run from the folder that contains package.js
        server.get('/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function (err, res, body) {
            assert.equal(read('sampleContainer/example.ttl'), '<#current> <#temp> 123 .')
            rm('sampleContainer/example.ttl')
            done(err)
          })
      })
    })
  })
})
