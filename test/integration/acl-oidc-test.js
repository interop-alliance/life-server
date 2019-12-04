const assert = require('chai').assert
const fs = require('fs-extra')
const request = require('request')
const path = require('path')
const { promisify } = require('util')
const { loadProvider, rm, checkDnsSettings, cleanDir } = require('../utils')
const IDToken = require('@interop-alliance/oidc-op/src/IDToken')

const ldnode = require('../../index')

const port = 7777
const serverUri = 'https://localhost:7777'
const rootPath = path.join(__dirname, '../resources/accounts-acl')
const dbPath = path.join(rootPath, 'db')
const oidcProviderPath = path.join(dbPath, 'oidc', 'op', 'provider.json')
const configPath = path.join(rootPath, 'config')

const user1 = 'https://tim.localhost:7777/web#id'
const timAccountUri = 'https://tim.localhost:7777'
const user2 = 'https://nicola.localhost:7777/web#id'

let oidcProvider

// To be initialized in the before() block
const userCredentials = {
  // idp: https://localhost:7777
  // web id: https://tim.localhost:7777/web#id
  user1: '',
  // web id: https://nicola.localhost:7777/web#id
  user2: ''
}

async function issueIdToken (oidcProvider, webId) {
  const jwt = IDToken.issue(oidcProvider, {
    sub: webId,
    aud: [serverUri, 'client123'],
    azp: 'client123'
  })

  return jwt.encode()
}

const argv = {
  root: rootPath,
  serverUri,
  dbPath,
  port,
  configPath,
  sslKey: path.join(__dirname, '../keys/key.pem'),
  sslCert: path.join(__dirname, '../keys/cert.pem'),
  webid: true,
  multiuser: true,
  skipWelcomePage: true,
  skipInitLocalRp: true
}

describe('ACL with WebID+OIDC over HTTP', () => {
  let ldp

  before(async () => {
    checkDnsSettings()

    ldp = await ldnode.createServer(argv)

    oidcProvider = await loadProvider(oidcProviderPath)
    const tokens = await Promise.all([
      issueIdToken(oidcProvider, user1),
      issueIdToken(oidcProvider, user2)
    ])
    userCredentials.user1 = tokens[0]
    userCredentials.user2 = tokens[1]
    await promisify(ldp.listen.bind(ldp))(port)
  })

  after(() => {
    cleanDir(rootPath)
    ldp.close()
  })

  const origin1 = 'http://example.org/'
  const origin2 = 'http://example.com/'

  function createOptions (path, user) {
    const options = {
      url: timAccountUri + path,
      headers: {
        accept: 'text/turtle'
      }
    }
    if (user) {
      const accessToken = userCredentials[user]
      options.headers.Authorization = 'Bearer ' + accessToken
    }

    return options
  }

  describe('no ACL', function () {
    it('should return 403 for any resource', function (done) {
      var options = createOptions('/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('should not have the `User` set in the Response Header', function (done) {
      var options = createOptions('/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.notProperty(response.headers, 'user')
        done()
      })
    })
  })

  describe('empty .acl', function () {
    describe('with no default in parent path', function () {
      it('should give no access', function (done) {
        var options = createOptions('/empty-acl/test-folder', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should not let edit the .acl', function (done) {
        var options = createOptions('/empty-acl/.acl', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should not let read the .acl', function (done) {
        var options = createOptions('/empty-acl/.acl', 'user1')
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
    })
    describe('with default in parent path', function () {
      before(() => {
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/another-empty-folder/test-file.acl')
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/test-folder/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/test-file.acl')
        rm('/accounts-acl/tim.localhost/write-acl/test-folder2/')
      })

      after(() => {
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/test-folder/')
        rm('/accounts-acl/tim.localhost/write-acl/test-folder2/')
      })

      it('should fail to create a container', (done) => {
        var options = createOptions('/write-acl/empty-acl/test-folder/', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should fail creation of new files', (done) => {
        var options = createOptions('/write-acl/empty-acl/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should fail creation of new files in deeper paths', (done) => {
        var options = createOptions('/write-acl/empty-acl/test-folder/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('Should not create empty acl file', (done) => {
        var options = createOptions('/write-acl/empty-acl/another-empty-folder/test-file.acl', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should return text/turtle for the acl file', function (done) {
        var options = createOptions('/write-acl/.acl', 'user1')
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          assert.match(response.headers['content-type'], /text\/turtle/)
          done()
        })
      })
      // TODO/FIXME: Sort out accessTo: issue here
      it.skip('should fail as acl:default it used to try to authorize', function (done) {
        var options = createOptions('/write-acl/bad-acl-access/.acl', 'user1')
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should create test file', function (done) {
        var options = createOptions('/write-acl/test-file', 'user1')
        options.body = '<a> <b> <c> .'
        request.put(options, function (error, response, body) {
          console.error(error)
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it("should create test file's acl file", function (done) {
        var options = createOptions('/write-acl/test-file.acl', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it("should not access test file's new empty acl file", function (done) {
        var options = createOptions('/write-acl/test-file.acl', 'user1')
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })

      after(function () {
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/another-empty-folder/test-file.acl')
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/test-folder/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/test-file.acl')
      })
    })
  })

  describe('Origin', function () {
    let _error, _response

    before(function (done) {
      rm('/accounts-acl/tim.localhost/origin/test-folder/.acl')

      var options = createOptions('/origin/test-folder/.acl', 'user1', 'text/turtle')
      options.body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <https://localhost:3456/origin/test-folder/.acl>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
        '<#Public> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n' +
        ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
      request.put(options, function (error, response, body) {
        _error = error
        _response = response
        done()
      })
    })

    it('should be no error', () => assert.equal(_error, null))
    it('should return 200', () => assert.equal(_response.statusCode, 201))

    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/origin/test-folder/', 'user1')
      options.headers.origin = origin1

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/origin/test-folder/', 'user1')
        options.headers.origin = origin1

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('user1 should be able to access test directory when origin is invalid',
      function (done) {
        var options = createOptions('/origin/test-folder/', 'user1')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('agent should be able to access test directory', function (done) {
      var options = createOptions('/origin/test-folder/')
      options.headers.origin = origin1

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/origin/test-folder/', 'user1')
        options.headers.origin = origin1

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('agent should be able to access test directory when origin is invalid',
      function (done) {
        var options = createOptions('/origin/test-folder/')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })

    after(function () {
      rm('/accounts-acl/tim.localhost/origin/test-folder/.acl')
    })
  })

  describe('Public Read-only', function () {
    var body = fs.readFileSync(path.join(rootPath, 'tim.localhost/read-acl/.acl'))
    it('user1 should be able to access ACL file', function (done) {
      var options = createOptions('/read-acl/.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/read-acl/', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify ACL file', function (done) {
      var options = createOptions('/read-acl/.acl', 'user1')
      options.body = body
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 204)
        done()
      })
    })
    it('user2 should be able to access test directory', function (done) {
      var options = createOptions('/read-acl/', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to access ACL file', function (done) {
      var options = createOptions('/read-acl/.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to modify ACL file', function (done) {
      var options = createOptions('/read-acl/.acl', 'user2')
      options.body = '<d> <e> <f> .'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('agent should be able to access test direcotory', function (done) {
      var options = createOptions('/read-acl/')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should not be able to modify ACL file', function (done) {
      var options = createOptions('/read-acl/.acl')
      options.body = '<d> <e> <f> .'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
  })

  describe('Append-only', function () {
    // var body = fs.readFileSync(__dirname + '/resources/append-acl/abc.ttl.acl')
    it("user1 should be able to access test file's ACL file", function (done) {
      var options = createOptions('/append-acl/abc.ttl.acl', 'user1')
      request.head(options, function (error, response) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to PATCH a resource', function (done) {
      var options = createOptions('/append-inherited/test.ttl', 'user1')
      options.body = 'INSERT DATA { :test  :hello 456 .}'
      options.headers['content-type'] = 'application/sparql-update'
      request.patch(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test file', function (done) {
      var options = createOptions('/append-acl/abc.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    // TODO POST instead of PUT
    it('user1 should be able to modify test file', function (done) {
      var options = createOptions('/append-acl/abc.ttl', 'user1')
      options.body = '<a> <b> <c> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 204)
        done()
      })
    })
    it("user2 should not be able to access test file's ACL file", function (done) {
      var options = createOptions('/append-acl/abc.ttl.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to access test file', function (done) {
      var options = createOptions('/append-acl/abc.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 (with append permission) cannot use PUT to append', function (done) {
      var options = createOptions('/append-acl/abc.ttl', 'user2')
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('agent should not be able to access test file', function (done) {
      var options = createOptions('/append-acl/abc.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent (with append permissions) should not PUT', function (done) {
      var options = createOptions('/append-acl/abc.ttl')
      options.body = '<g> <h> <i> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    after(function () {
      rm('/accounts-acl/tim.localhost/append-inherited/test.ttl')
    })
  })

  describe.skip('Group', function () {
    // before(function () {
    //   rm('/accounts-acl/tim.localhost/group/test-folder/.acl')
    // })

    it('should PUT new ACL file', (done) => {
      var options = createOptions('/group/test-folder/.acl', 'user1')
      options.body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <./.acl>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
        '<#Public> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agentGroup> <group-listing#folks>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/group/test-folder/', 'user1')

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should be able to access test directory', function (done) {
      var options = createOptions('/group/test-folder/', 'user2')

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should be able to write a file in the test directory',
      function (done) {
        var options = createOptions('/group/test-folder/test.ttl', 'user2')
        options.body = '<#Dahut> a <https://dbpedia.org/resource/Category:French_legendary_creatures>.\n'

        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
    it('user1 should be able to get the file', function (done) {
      var options = createOptions('/group/test-folder/test.ttl', 'user1')

      request.get(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to write to the ACL',
      function (done) {
        var options = createOptions('/group/test-folder/.acl', 'user2')
        options.body = '<#Dahut> a <https://dbpedia.org/resource/Category:French_legendary_creatures>.\n'

        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
    it('user1 should be able to delete the file', function (done) {
      var options = createOptions('/group/test-folder/test.ttl', 'user1')

      request.delete(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200) // Should be 204, right?
        done()
      })
    })
  })

  describe('Restricted', function () {
    var body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./abc2.ttl>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Restricted> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./abc2.ttl>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user2 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>.\n'
    it("user1 should be able to modify test file's ACL file", function (done) {
      var options = createOptions('/append-acl/abc2.ttl.acl', 'user1')
      options.body = body
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 204)
        done()
      })
    })
    it("user1 should be able to access test file's ACL file", function (done) {
      var options = createOptions('/append-acl/abc2.ttl.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test file', function (done) {
      var options = createOptions('/append-acl/abc2.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify test file', function (done) {
      var options = createOptions('/append-acl/abc2.ttl', 'user1')
      options.body = '<a> <b> <c> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 204)
        done()
      })
    })
    it('user2 should be able to access test file', function (done) {
      var options = createOptions('/append-acl/abc2.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user2 should not be able to access test file's ACL file", function (done) {
      var options = createOptions('/append-acl/abc2.ttl.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should be able to modify test file', function (done) {
      var options = createOptions('/append-acl/abc2.ttl', 'user2')
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 204)
        done()
      })
    })
    it('agent should not be able to access test file', function (done) {
      var options = createOptions('/append-acl/abc2.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent should not be able to modify test file', function (done) {
      var options = createOptions('/append-acl/abc2.ttl')
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
  })

  describe('default', function () {
    before(function () {
      rm('/accounts-acl/tim.localhost/write-acl/default-for-new/.acl')
      rm('/accounts-acl/tim.localhost/write-acl/default-for-new/test-file.ttl')
    })

    var body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#default> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Default> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#default> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
    it("user1 should be able to modify test directory's ACL file", function (done) {
      var options = createOptions('/write-acl/default-for-new/.acl', 'user1')
      options.body = body
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it("user1 should be able to access test direcotory's ACL file", function (done) {
      var options = createOptions('/write-acl/default-for-new/.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to create new test file', function (done) {
      var options = createOptions('/write-acl/default-for-new/test-file.ttl', 'user1')
      options.body = '<a> <b> <c> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it('user1 should be able to access new test file', function (done) {
      var options = createOptions('/write-acl/default-for-new/test-file.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user2 should not be able to access test direcotory's ACL file", function (done) {
      var options = createOptions('/write-acl/default-for-new/.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should be able to access new test file', function (done) {
      var options = createOptions('/write-acl/default-for-new/test-file.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to modify new test file', function (done) {
      var options = createOptions('/write-acl/default-for-new/test-file.ttl', 'user2')
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('agent should be able to access new test file', function (done) {
      var options = createOptions('/write-acl/default-for-new/test-file.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should not be able to modify new test file', function (done) {
      var options = createOptions('/write-acl/default-for-new/test-file.ttl')
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })

    after(function () {
      rm('/accounts-acl/tim.localhost/write-acl/default-for-new/.acl')
      rm('/accounts-acl/tim.localhost/write-acl/default-for-new/test-file.ttl')
    })
  })

  describe('Wrongly set accessTo', function () {
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/dot-acl/', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
  })
})
