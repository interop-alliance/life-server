const Solid = require('../../index')
const path = require('path')
const { cleanDir } = require('../utils')
const supertest = require('supertest')
// In this test we always assume that we are Alice

describe('API', () => {
  let alice

  let aliceServerUri = 'https://localhost:5000'
  let configPath = path.join(__dirname, '../resources/config')
  let aliceDbPath = path.join(__dirname,
    '../resources/accounts-scenario/alice/db')
  let aliceRootPath = path.join(__dirname, '../resources/accounts-scenario/alice')

  const serverConfig = {
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    webid: true,
    multiuser: false,
    configPath
  }

  const alicePod = Solid.createServer(
    Object.assign({
      root: aliceRootPath,
      serverUri: aliceServerUri,
      dbPath: aliceDbPath
    }, serverConfig)
  )

  function startServer (pod, port) {
    return new Promise((resolve) => {
      pod.listen(port, () => { resolve() })
    })
  }

  before(() => {
    return Promise.all([
      startServer(alicePod, 5000)
    ]).then(() => {
      alice = supertest(aliceServerUri)
    })
  })

  after(() => {
    alicePod.close()
    cleanDir(aliceRootPath)
  })

  describe('Capability Discovery', () => {
    describe('OPTIONS API', () => {
      it('should return the service Link header', (done) => {
        alice.options('/')
          .expect('Link', /<.*\.well-known\/solid>; rel="service"/)
          .expect(204, done)
      })

      it('should return the http://openid.net/specs/connect/1.0/issuer Link rel header', (done) => {
        alice.options('/')
          .expect('Link', /<https:\/\/localhost:5000>; rel="http:\/\/openid\.net\/specs\/connect\/1\.0\/issuer"/)
          .expect(204, done)
      })

      it('should return a service Link header without multiple slashes', (done) => {
        alice.options('/')
          .expect('Link', /<.*[^/]\/\.well-known\/solid>; rel="service"/)
          .expect(204, done)
      })
    })
  })
})
