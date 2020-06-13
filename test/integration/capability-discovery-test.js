const server = require('../../index')
const path = require('path')
const { cleanDir, startServer } = require('../utils')
const supertest = require('supertest')
// In this test we always assume that we are Alice

describe('API', () => {
  let alice

  const aliceServerUri = 'https://localhost:5000'
  const configPath = path.join(__dirname, '..', 'resources', 'config')
  const aliceDbPath = path.join(__dirname,
    '..', 'resources', 'accounts-scenario', 'alice', 'db')
  const aliceRootPath = path.join(__dirname, '..', 'resources',
    'accounts-scenario', 'alice')

  const serverConfig = {
    sslKey: path.join(__dirname, '..', 'keys', 'key.pem'),
    sslCert: path.join(__dirname, '..', 'keys', 'cert.pem'),
    auth: 'oidc',
    webid: true,
    multiuser: false,
    skipWelcomePage: true,
    configPath
  }

  let alicePod

  before(async () => {
    alicePod = await server.createServer(
      Object.assign({
        root: aliceRootPath,
        serverUri: aliceServerUri,
        dbPath: aliceDbPath
      }, serverConfig)
    )
    await startServer(alicePod, 5000)
    alice = supertest(aliceServerUri)
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
