var assert = require('chai').assert
var fs = require('fs')
var request = require('request')
var path = require('path')
const { promisify } = require('util')
// Helper functions for the FS
var rm = require('./../utils').rm

var solidServer = require('../../src')

describe('HTTP COPY API', function () {
  const address = 'https://localhost:3456'

  let ldp

  before(async () => {
    ldp = await solidServer.createServer({
      root: path.join(__dirname, '..', 'resources', 'accounts', 'localhost'),
      sslKey: path.join(__dirname, '..', 'keys', 'key.pem'),
      sslCert: path.join(__dirname, '..', 'keys', 'cert.pem'),
      webid: false,
      skipWelcomePage: true,
      serverUri: address
    })
    await promisify(ldp.listen.bind(ldp))(3456)
  })

  after(async () => {
    // Clean up after COPY API tests
    await rm('/accounts/localhost/sampleUser1Container/nicola-copy.jpg')
    ldp.close()
  })

  var userCredentials = {
    user1: {
      cert: fs.readFileSync(path.join(__dirname, '..', 'keys', 'user1-cert.pem')),
      key: fs.readFileSync(path.join(__dirname, '..', 'keys', 'user1-key.pem'))
    },
    user2: {
      cert: fs.readFileSync(path.join(__dirname, '..', 'keys', 'user2-cert.pem')),
      key: fs.readFileSync(path.join(__dirname, '..', 'keys', 'user2-key.pem'))
    }
  }

  function createOptions (method, url, user) {
    var options = {
      method: method,
      url: url,
      headers: {}
    }
    if (user) {
      options.agentOptions = userCredentials[user]
    }
    return options
  }

  it('should create the copied resource', (done) => {
    var copyFrom = '/samplePublicContainer/nicola.jpg'
    var copyTo = '/sampleUser1Container/nicola-copy.jpg'
    var uri = address + copyTo
    var options = createOptions('COPY', uri, 'user1')
    options.headers.Source = copyFrom

    request(uri, options, function (error, response) {
      assert.equal(error, null)
      assert.equal(response.statusCode, 201)

      assert.equal(response.headers.location,
        'https://localhost:3456/sampleUser1Container/nicola-copy.jpg')
      const destinationPath = path.join(__dirname, '../resources/accounts/localhost', copyTo)
      assert.ok(fs.existsSync(destinationPath),
        'Resource created via COPY should exist')
      done()
    })
  })

  it('should give a 404 if source document doesn\'t exist', function (done) {
    var copyFrom = '/samplePublicContainer/invalid-resource'
    var copyTo = '/sampleUser1Container/invalid-resource-copy'
    var uri = address + copyTo
    var options = createOptions('COPY', uri, 'user1')
    options.headers.Source = copyFrom
    request(uri, options, function (error, response) {
      assert.equal(error, null)
      assert.equal(response.statusCode, 404)
      done()
    })
  })

  it('should give a 400 if Source header is not supplied', function (done) {
    var copyTo = '/sampleUser1Container/nicola-copy.jpg'
    var uri = address + copyTo
    var options = createOptions('COPY', uri, 'user1')
    request(uri, options, function (error, response) {
      assert.equal(error, null)
      assert.equal(response.statusCode, 400)
      done()
    })
  })
})
