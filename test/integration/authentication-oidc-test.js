const Solid = require('../../index')
const path = require('path')
const fs = require('fs-extra')
const UserAccount = require('../../lib/account-mgmt/user-account')
const { OIDCWebClient } = require('oidc-web')

const fetch = require('node-fetch')
const localStorage = require('localstorage-memory')
const { URL } = require('url')

global.URL = URL
global.URLSearchParams = require('whatwg-url').URLSearchParams
const currentLocation = 'https://app.com/'
global.window = {
  location: { href: currentLocation }
}

const { cleanDir, startServer, testStorage } = require('../utils')

const supertest = require('supertest')
const nock = require('nock')
const chai = require('chai')
const expect = chai.expect
chai.use(require('dirty-chai'))
chai.should()

// In this test we always assume that we are Alice

describe('Authentication API (OIDC)', () => {
  let alice, bob

  const aliceServerUri = 'https://localhost:7000'
  const aliceWebId = 'https://localhost:7000/web#id'
  const configPath = path.join(__dirname, '../resources/config')
  const aliceDbPath = path.join(__dirname,
    '../resources/accounts-scenario/alice/db')

  const aliceHost = { serverUri: aliceServerUri }
  const storage = testStorage(aliceHost, aliceDbPath)
  const aliceCredentialStore = storage.users

  const bobServerUri = 'https://localhost:7001'
  const bobDbPath = path.join(__dirname,
    '../resources/accounts-scenario/bob/db')

  const serverConfig = {
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    webid: true,
    multiuser: false,
    skipWelcomePage: true,
    configPath
  }

  const aliceRootPath = path.join(__dirname, '../resources/accounts-scenario/alice')
  let alicePod

  const bobRootPath = path.join(__dirname, '../resources/accounts-scenario/bob')
  let bobPod

  before(async () => {
    alicePod = await Solid.createServer(
      Object.assign({
        root: aliceRootPath,
        serverUri: aliceServerUri,
        dbPath: aliceDbPath
      }, serverConfig))

    await startServer(alicePod, 7000)

    bobPod = await Solid.createServer(
      Object.assign({
        root: bobRootPath,
        serverUri: bobServerUri,
        dbPath: bobDbPath
      }, serverConfig)
    )

    await startServer(bobPod, 7001)

    alice = supertest(aliceServerUri)
    bob = supertest(bobServerUri)
  })

  after(() => {
    alicePod.close()
    bobPod.close()
    fs.removeSync(path.join(aliceDbPath, 'users'))
    fs.removeSync(path.join(aliceDbPath, 'oidc/rp'))
    fs.removeSync(path.join(bobDbPath, 'oidc/rp/clients'))
    cleanDir(aliceRootPath)
    cleanDir(bobRootPath)
  })

  describe('Provider Discovery (POST /api/auth/select-provider)', () => {
    it('form should load on a get', done => {
      alice.get('/api/auth/select-provider')
        .expect(200)
        .expect((res) => { res.text.match(/Provider Discovery/) })
        .end(done)
    })

    it('should complain if WebID URI is missing', (done) => {
      alice.post('/api/auth/select-provider')
        .expect(400, done)
    })

    it('should prepend https:// to webid, if necessary', (done) => {
      alice.post('/api/auth/select-provider')
        .type('form')
        .send({ webid: 'localhost:7000' })
        .expect(302, done)
    })

    it("should return a 400 if endpoint doesn't have Link Headers", (done) => {
      // Fake provider, replies with 200 and no Link headers
      nock('https://amazingwebsite.tld').intercept('/', 'OPTIONS').reply(204)

      alice.post('/api/auth/select-provider')
        .send('webid=https://amazingwebsite.tld/')
        .expect(400)
        .end(done)
    })

    it('should redirect user to discovered provider if valid uri', (done) => {
      bob.post('/api/auth/select-provider')
        .send('webid=' + aliceServerUri)
        .expect(302)
        .end((err, res) => {
          const loginUri = res.header.location
          expect(loginUri.startsWith(aliceServerUri + '/authorize'))
          done(err)
        })
    })
  })

  describe('Login page (GET /login)', () => {
    it('should load the user login form', () => {
      return alice.get('/login')
        .expect(200)
    })
  })

  describe('Login by Username and Password (POST /login/password)', () => {
    // Logging in as alice, to alice's pod
    const alicePassword = '12345'
    beforeEach(() => {
      const aliceAccount = UserAccount.from({ webId: aliceWebId })

      return aliceCredentialStore.createUser(aliceAccount, alicePassword)
        .catch(console.error.bind(console))
    })

    afterEach(() => {
      fs.removeSync(path.join(aliceDbPath, 'users/users'))
    })

    describe('after performing a correct login', () => {
      let response, cookie

      before(done => {
        const aliceAccount = UserAccount.from({ webId: aliceWebId })

        aliceCredentialStore.createUser(aliceAccount, alicePassword)
        alice.post('/login/password')
          .type('form')
          .send({ username: 'alice' })
          .send({ password: alicePassword })
          .end((err, res) => {
            response = res
            cookie = response.headers['set-cookie'][0]
            done(err)
          })
      })

      it('should redirect to /authorize', () => {
        const loginUri = response.headers.location
        expect(response).to.have.property('status', 302)
        expect(loginUri.startsWith(aliceServerUri + '/authorize'))
      })

      it('should set the cookie', () => {
        expect(cookie).to.match(/connect.sid=/)
      })

      it('should set the cookie with HttpOnly', () => {
        expect(cookie).to.match(/HttpOnly/)
      })

      it('should set the cookie with Secure', () => {
        expect(cookie).to.match(/Secure/)
      })

      describe('and performing a subsequent request', () => {
        describe('without that cookie', () => {
          let response
          before(done => {
            alice.get('/')
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        describe('with that cookie and a non-matching origin', () => {
          let response
          before(done => {
            alice.get('/')
              .set('Cookie', cookie)
              .set('Origin', bobServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        describe('with that cookie but without origin', () => {
          let response
          before(done => {
            alice.get('/')
              .set('Cookie', cookie)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 200', () => {
            expect(response).to.have.property('status', 200)
          })
        })

        describe('with that cookie and a matching origin', () => {
          let response
          before(done => {
            alice.get('/')
              .set('Cookie', cookie)
              .set('Origin', aliceServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 200', () => {
            expect(response).to.have.property('status', 200)
          })
        })
      })
    })

    it('should throw a 400 if no username is provided', (done) => {
      alice.post('/login/password')
        .type('form')
        .send({ password: alicePassword })
        .expect(400, done)
    })

    it('should throw a 400 if no password is provided', (done) => {
      alice.post('/login/password')
        .type('form')
        .send({ username: 'alice' })
        .expect(400, done)
    })

    it('should throw a 400 if user is found but no password match', (done) => {
      alice.post('/login/password')
        .type('form')
        .send({ username: 'alice' })
        .send({ password: 'wrongpassword' })
        .expect(400, done)
    })
  })

  describe('Two Pods + Browser Login workflow', () => {
    // Step 1: Alice tries to access bob.com/shared-with-alice.txt, and
    //   gets redirected to bob.com's Provider Discovery endpoint
    it('401 Unauthorized -> redirect to provider discovery', (done) => {
      bob.get('/shared-with-alice.txt')
        .expect(401)
        .end((err, res) => {
          if (err) return done(err)
          const redirectString = 'http-equiv="refresh" ' +
            `content="0; url=${bobServerUri}/api/auth/select-provider`
          expect(res.text).to.match(new RegExp(redirectString))
          done()
        })
    })

    // Step 2: Alice enters her pod's URI to Bob's Provider Discovery endpoint
    it('Enter webId -> redirect to provider login', () => {
      return bob.post('/api/auth/select-provider')
        .send('webid=' + aliceServerUri)
        .expect(302)
        .then(res => {
          // Submitting select-provider form redirects to Alice's pod's /authorize
          const authorizeUri = res.header.location
          expect(authorizeUri.startsWith(aliceServerUri + '/authorize'))

          console.log('REDIRECTED TO:', authorizeUri)

          // Follow the redirect to /authorize
          const authorizePath = authorizeUri.replace(aliceServerUri, '') // (new URL(authorizeUri)).pathname
          return alice.get(authorizePath)
        })
        .then(res => {
          // Since alice not logged in to her pod, /authorize redirects to /login
          const loginUri = res.header.location

          expect(loginUri.startsWith('/login'))
        })
    })
  })

  describe('Two Pods + Web App Login Workflow', () => {
    const aliceAccount = UserAccount.from({ webId: aliceWebId })
    const alicePassword = '12345'
    const aliceIdentityProvider = aliceServerUri

    const auth = new OIDCWebClient({
      popToken: true,
      store: localStorage,
      provider: aliceIdentityProvider
    })

    let authorizationUri, loginUri, authParams, callbackUri
    let loginFormFields = ''
    let currentSession, bearerToken

    before(async () => {
      const aliceRpOptions = {
        popToken: true,
        redirect_uri: 'https://app.example.com/callback'
      }

      await aliceCredentialStore.createUser(aliceAccount, alicePassword)

      return auth.registerPublicClient(aliceIdentityProvider, aliceRpOptions)
    })

    after(() => {
      fs.removeSync(path.join(aliceDbPath, 'users/users'))
      // fs.removeSync(path.join(aliceDbPath, 'oidc/op/tokens'))

      // const clientId = auth.currentClient.registration['client_id']
      // const registration = `_key_${clientId}.json`
      // fs.removeSync(path.join(aliceDbPath, 'oidc/op/clients', registration))
    })

    // Step 1: An app makes a GET request and receives a 401
    it('should get a 401 error on a REST request to a protected resource', async () => {
      const response = await fetch(bobServerUri + '/shared-with-alice.txt')

      expect(response.status).to.equal(401)
      expect(response.headers.get('www-authenticate'))
        .to.equal(`Bearer realm="${bobServerUri}", scope="openid webid"`)
    })

    // Step 2: App presents the Select Provider UI to user, determine the
    //   preferred provider uri (here, aliceServerUri), and constructs
    //   an authorization uri for that provider
    it('should determine the authorization uri for a preferred provider', async () => {
      authorizationUri = await auth.prepareAuthRequest({ provider: aliceIdentityProvider })
      expect(authorizationUri.startsWith(aliceServerUri + '/authorize'))
    })

    // Step 3: App redirects user to the authorization uri for login
    it('should redirect user to /authorize and /login', async () => {
      const response = await fetch(authorizationUri, { redirect: 'manual' })
      // Since user is not logged in, /authorize redirects to /login
      expect(response.status).to.equal(302)

      loginUri = new URL(response.headers.get('location'))
      expect(loginUri.toString().startsWith(aliceServerUri + '/login'))
        .to.be.true()

      authParams = loginUri.searchParams
    })

    // Step 4: Pod returns a /login page with appropriate hidden form fields
    it('should display the /login form', async () => {
      const loginPage = await fetch(loginUri.toString())
      const pageText = await loginPage.text()

      // Login page should contain the relevant auth params as hidden fields
      authParams.forEach((value, key) => {
        const hiddenField = `<input type="hidden" name="${key}" id="${key}" value="${value}" />`

        const fieldRegex = new RegExp(hiddenField)

        expect(pageText).to.match(fieldRegex)

        loginFormFields += `${key}=` + encodeURIComponent(value) + '&'
      })
    })

    // Step 5: User submits their username & password via the /login form
    it('should login via the /login form', async () => {
      loginFormFields += `username=${'alice'}&password=${alicePassword}`

      const loginResponse = await fetch(aliceServerUri + '/login/password', {
        method: 'POST',
        body: loginFormFields,
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        credentials: 'include'
      })
      expect(loginResponse.status).to.equal(302)
      const postLoginUrl = loginResponse.headers.get('location')
      const cookie = loginResponse.headers.get('set-cookie')

      // Successful login gets redirected back to /authorize and then
      // back to app
      expect(postLoginUrl.startsWith(aliceServerUri + '/authorize'))
        .to.be.true()
      expect(postLoginUrl.includes('scope=openid'))
        .to.be.true('Post-login url must include auth query params')

      const postLoginResponse = await fetch(postLoginUrl, {
        redirect: 'manual', headers: { cookie }
      })
      // User gets redirected back to original app
      expect(postLoginResponse.status).to.equal(302)
      callbackUri = postLoginResponse.headers.get('location')
      expect(callbackUri.startsWith('https://app.example.com#'))
    })

    // Step 6: Web App extracts tokens from the uri hash fragment, uses
    //  them to access protected resource
    it('should use id token from the callback uri to access shared resource', async () => {
      global.window.location.href = callbackUri

      const bobProtectedResource = bobServerUri + '/shared-with-alice.txt'

      currentSession = await auth.currentSession()

      const webId = currentSession.idClaims.sub
      expect(webId).to.equal(aliceWebId)

      bearerToken = await currentSession.bearerTokenFor(bobProtectedResource)

      const response = await fetch(bobProtectedResource, {
        headers: {
          // This is Alice's bearer token (issued to Bob's server) with her own Web ID
          Authorization: 'Bearer ' + bearerToken
        }
      })

      expect(response.status).to.equal(200)
      const contents = await response.text()
      expect(contents).to.equal('protected contents\n')
    })

    it('should not be able to reuse the bearer token for bob server on another server', async () => {
      const privateAliceResourcePath = aliceServerUri + '/private-for-alice.txt'

      const response = await fetch(privateAliceResourcePath, {
        headers: {
          // This is Alice's bearer token (issued to Bob's server) with her own Web ID
          Authorization: 'Bearer ' + bearerToken
        }
      })
      // It will get rejected; it was issued for Bob's server only
      expect(response.status).to.equal(403)
    })
  })

  describe('Post-logout page (GET /goodbye)', () => {
    it('should load the post-logout page', () => {
      return alice.get('/goodbye')
        .expect(200)
    })
  })
})
