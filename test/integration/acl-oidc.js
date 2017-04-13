const assert = require('chai').assert
const fs = require('fs-extra')
const request = require('request')
const path = require('path')
const rm = require('../test-utils').rm

const ldnode = require('../../index')

const port = 7777
const serverUri = `https://localhost:7777`
const rootPath = path.join(__dirname, '../resources/accounts-acl')
const dbPath = path.join(rootPath, 'db')
const configPath = path.join(rootPath, 'config')

const user1 = 'https://tim.localhost:7777/profile/card#me'
const timAccountUri = 'https://tim.localhost:7777'
const user2 = 'https://nicola.localhost:7777/profile/card#me'

const userCredentials = {
  user1: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkFWUzVlZk5pRUVNIn0.eyJpc3MiOiJodHRwczovL2xvY2FsaG9zdDo3Nzc3Iiwic3ViIjoiaHR0cHM6Ly90aW0ubG9jYWxob3N0Ojc3NzcvcHJvZmlsZS9jYXJkI21lIiwiYXVkIjoiN2YxYmU5YWE0N2JiMTM3MmIzYmM3NWU5MWRhMzUyYjQiLCJleHAiOjc3OTkyMjkwMDksImlhdCI6MTQ5MjAyOTAwOSwianRpIjoiZWY3OGQwYjY3ZWRjNzJhMSIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUifQ.H9lxCbNc47SfIq3hhHnj48BE-YFnvhCfDH9Jc4PptApTEip8sVj0E_u704K_huhNuWBvuv3cDRDGYZM7CuLnzgJG1BI75nXR9PYAJPK9Ketua2KzIrftNoyKNamGqkoCKFafF4z_rsmtXQ5u1_60SgWRcouXMpcHnnDqINF1JpvS21xjE_LbJ6qgPEhu3rRKcv1hpRdW9dRvjtWb9xu84bAjlRuT02lyDBHgj2utxpE_uqCbj48qlee3GoqWpGkSS-vJ6JA0aWYgnyv8fQsxf9rpdFNzKRoQO6XYMy6niEKj8aKgxjaUlpoGGJ5XtVLHH8AGwjYXR8iznYzJvEcB7Q',
  user2: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkFWUzVlZk5pRUVNIn0.eyJpc3MiOiJodHRwczovL2xvY2FsaG9zdDo3Nzc3Iiwic3ViIjoiaHR0cHM6Ly9uaWNvbGEubG9jYWxob3N0Ojc3NzcvcHJvZmlsZS9jYXJkI21lIiwiYXVkIjoiN2YxYmU5YWE0N2JiMTM3MmIzYmM3NWU5MWRhMzUyYjQiLCJleHAiOjc3OTkyMjkwMDksImlhdCI6MTQ5MjAyOTAwOSwianRpIjoiMmQwOTJlZGVkOWI5YTQ5ZSIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUifQ.qs-_pZPZZzaK_pIOQr-T3yMxVPo1Z5R-TwIi_a4Q4Arudu2s9VkoPmsfsCeVc22i6I1uLiaRe_9qROpXd-Oiy0dsMMEtqyQWcc0zxp3RYQs99sAi4pTPOsTjtJwsMRJp4n8nx_TWQ7mS1grZEdSLr53v-2QqTZXVW8cBu4vQ0slXWsKsuaySk-hCMnxk7vHj70uFpuKRjx4CBHkEWXooEyXgcmS8QR-d_peq8Ldkq1Bez4SAQ9sy_4UVaIWoLRqA7gr0Grh7OTHZNdYV_NJoH0mnbCuyS5N5YEI8QuUzuYlSNhgZ_cZ3j1uqw_fs8SIHFtWMghdnT2JdRKUFfn4-vA'
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
  idp: true,
  auth: 'oidc',
  strictOrigin: true,
  host: { serverUri }
}

describe('ACL HTTP', function () {
  this.timeout(10000)

  var ldp, ldpHttpsServer

  before(done => {
    ldp = ldnode.createServer(argv)
    ldpHttpsServer = ldp.listen(port, done)
  })

  after(() => {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(path.join(rootPath, 'index.html'))
    fs.removeSync(path.join(rootPath, 'index.html.acl'))
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
      let accessToken = userCredentials[user]
      options.headers['Authorization'] = 'Bearer ' + accessToken
    }

    // console.log('in createOptions:', options)

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
    it('should have `User` set in the Response Header', function (done) {
      var options = createOptions('/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
  })

  describe('empty .acl', function () {
    describe('with no defaultForNew in parent path', function () {
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
    describe('with defaultForNew in parent path', function () {
      before(function () {
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/another-empty-folder/test-file.acl')
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/test-folder/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/empty-acl/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/test-file')
        rm('/accounts-acl/tim.localhost/write-acl/test-file.acl')
      })

      it('should fail to create a container', function (done) {
        var options = createOptions('/write-acl/empty-acl/test-folder/', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 409)
          done()
        })
      })
      it('should allow creation of new files', function (done) {
        var options = createOptions('/write-acl/empty-acl/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it('should allow creation of new files in deeper paths', function (done) {
        var options = createOptions('/write-acl/empty-acl/test-folder/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it('Should create empty acl file', function (done) {
        var options = createOptions('/write-acl/empty-acl/another-empty-folder/test-file.acl', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
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
      it('should create test file', function (done) {
        var options = createOptions('/write-acl/test-file', 'user1')
        options.body = '<a> <b> <c> .'
        request.put(options, function (error, response, body) {
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
      it("should access test file's acl file", function (done) {
        var options = createOptions('/write-acl/test-file.acl', 'user1')
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          assert.match(response.headers['content-type'], /text\/turtle/)
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
    before(function () {
      rm('/accounts-acl/tim.localhost/origin/test-folder/.acl')
    })

    it('should PUT new ACL file', function (done) {
      var options = createOptions('/origin/test-folder/.acl', 'user1')
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
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      // TODO triple header
      // TODO user header
      })
    })
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
    it('user1 should be denied access to test directory when origin is invalid',
      function (done) {
        var options = createOptions('/origin/test-folder/', 'user1')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
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
    it('agent should be denied access to test directory when origin is invalid',
      function (done) {
        var options = createOptions('/origin/test-folder/')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 401)
          done()
        })
      })

    after(function () {
      rm('/accounts-acl/tim.localhost/origin/test-folder/.acl')
    })
  })

  describe('Read-only', function () {
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
        assert.equal(response.statusCode, 201)
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
        assert.equal(response.statusCode, 201)
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
        assert.equal(response.statusCode, 201)
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
        assert.equal(response.statusCode, 201)
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
        assert.equal(response.statusCode, 201)
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

  describe('defaultForNew', function () {
    before(function () {
      rm('/accounts-acl/tim.localhost/write-acl/default-for-new/.acl')
      rm('/accounts-acl/tim.localhost/write-acl/default-for-new/test-file.ttl')
    })

    var body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#defaultForNew> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Default> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#defaultForNew> <./>;\n' +
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
})
