const Solid = require('../../index')
const path = require('path')
const supertest = require('supertest')
const expect = require('chai').expect
// In this test we always assume that we are Alice

describe('API', () => {
  let alice, aliceServer

  let aliceServerUri = 'https://localhost:5000'
  let configPath = path.join(__dirname, '../../config')
  let aliceDbPath = path.join(__dirname,
    '../resources/accounts-scenario/alice/db')

  const serverConfig = {
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    dataBrowser: false,
    fileBrowser: false,
    webid: true,
    idp: false,
    configPath
  }

  const alicePod = Solid.createServer(
    Object.assign({
      root: path.join(__dirname, '../resources/accounts-scenario/alice'),
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
    if (aliceServer) aliceServer.close()
  })

  describe('Capability Discovery', () => {
    describe('GET Service Capability document', () => {
      it('should exist', (done) => {
        alice.get('/.well-known/solid')
          .expect(200, done)
      })
      it('should be a json file by default', (done) => {
        alice.get('/.well-known/solid')
          .expect('content-type', /application\/json/)
          .expect(200, done)
      })
      it('includes a root element', (done) => {
        alice.get('/.well-known/solid')
          .end(function (err, req) {
            expect(req.body.root).to.exist
            return done(err)
          })
      })
      it('includes an apps config section', (done) => {
        const config = {
          apps: {
            'signin': '/signin/',
            'signup': '/signup/'
          }
        }
        const solid = Solid(config)
        let server = supertest(solid)
        server.get('/.well-known/solid')
          .end(function (err, req) {
            expect(req.body.apps).to.exist
            return done(err)
          })
      })
    })

    describe('OPTIONS API', () => {
      it('should return the service Link header', (done) => {
        alice.options('/')
          .expect('Link', /<.*\.well-known\/solid>; rel="service"/)
          .expect(204, done)
      })

      it('should still have previous link headers', (done) => {
        alice.options('/')
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
          .expect(204, done)
      })

      it('should return the oidc.provider Link header', (done) => {
        alice.options('/')
          .expect('Link', /<https:\/\/localhost:5000>; rel="oidc.provider"/)
          .expect(204, done)
      })
    })
  })
})
