
const supertest = require('supertest')
// Helper functions for the FS
const rdf = require('rdflib')

const { rm, read, checkDnsSettings, cleanDir } = require('../utils')
const ldnode = require('../../index')
const path = require('path')
const fs = require('fs-extra')
const { promisify } = require('util')

describe('AccountManager (OIDC account creation tests)', () => {
  const serverUri = 'https://localhost:3457'
  const host = 'localhost:3457'

  let server
  const rootPath = path.join(__dirname, '../resources/accounts/')
  const configPath = path.join(__dirname, '../resources/config')
  const dbPath = path.join(__dirname, '../resources/accounts/db')

  before(async () => {
    await checkDnsSettings()
    server = await ldnode.createServer({
      root: rootPath,
      configPath,
      sslKey: path.join(__dirname, '../keys/key.pem'),
      sslCert: path.join(__dirname, '../keys/cert.pem'),
      webid: true,
      multiuser: true,
      skipWelcomePage: true,
      dbPath,
      serverUri
    })

    await promisify(server.listen.bind(server))(3457)
  })

  after(async () => {
    server.close()
    cleanDir(path.join(rootPath, 'localhost'))
    await fs.remove(path.join(dbPath, 'users'))
  })

  // FIXME: Does this test even make sense?
  it.skip('should expect a 404 on GET /accounts', async () => {
    return supertest(serverUri).get('/api/accounts')
      .expect(404) // actually throws a 401 Unauthorized
  })

  describe('accessing accounts', () => {
    it('should be able to access public file of an account', async () => {
      return supertest('https://tim.' + host)
        .get('/hello.html')
        .expect(200)
    })
    it('should get 404 if root does not exist', async () => {
      return supertest('https://nicola.' + host)
        .head('/')
        .set('Accept', 'text/turtle')
        .set('Origin', 'http://example.com')
        .expect(404)
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect('Access-Control-Allow-Credentials', 'true')
    })
  })

  describe('creating an account with POST', function () {
    beforeEach(() => {
      rm('accounts/nicola.localhost')
    })

    after(() => {
      rm('accounts/nicola.localhost')
    })

    it('should not create WebID if no username is given', async () => {
      return supertest('https://nicola.' + host)
        .post('/api/accounts/new')
        .send('username=&password=12345')
        .expect(400)
    })

    it('should not create WebID if no password is given', async () => {
      return supertest('https://nicola.' + host)
        .post('/api/accounts/new')
        .send('username=nicola&password=')
        .expect(400)
    })

    it('should not create a WebID if it already exists', async () => {
      const subdomain = supertest('https://nicola.' + host)
      await subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345')
        .expect(302)
      return subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345')
        .expect(400)
    })

    it('should create the default folders', async () => {
      const subdomain = supertest('https://nicola.' + host)
      await subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345')
        .expect(302)

      const domain = host.split(':')[0]
      const card = read(path.join('accounts/nicola.' + domain,
        'web'))
      const cardAcl = read(path.join('accounts/nicola.' + domain,
        'web.acl'))
      const prefs = read(path.join('accounts/nicola.' + domain,
        'settings/prefs.ttl'))
      const rootMeta = read(path.join('accounts/nicola.' + domain, '.meta'))
      const rootMetaAcl = read(path.join('accounts/nicola.' + domain,
        '.meta.acl'))

      if (!(domain && card && cardAcl && prefs && rootMeta && rootMetaAcl)) {
        throw new Error('failed to create default files')
      }
    })

    it('should link WebID to the root account', async () => {
      const subdomain = supertest('https://nicola.' + host)
      await subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345')
        .expect(302)

      const data = await subdomain.get('/.meta')
        .expect(200)

      const graph = rdf.graph()
      await promisify(rdf.parse)(
        data.text,
        graph,
        'https://nicola.' + host + '/.meta',
        'text/turtle')
      const statements = graph.statementsMatching(
        undefined,
        rdf.sym('http://www.w3.org/ns/solid/terms#account'),
        undefined)
      if (statements.length !== 1) {
        throw new Error('missing link to WebID of account')
      }
    })

    it('should create a private settings container', async () => {
      return supertest('https://nicola.' + host)
        .head('/settings/')
        .expect(401)
    })

    it('should create a private prefs file in the settings container', async () => {
      return supertest('https://nicola.' + host)
        .head('/inbox/prefs.ttl')
        .expect(401)
    })

    it('should create a private inbox container', async () => {
      return supertest('https://nicola.' + host)
        .head('/inbox/')
        .expect(401)
    })
  })
})

describe('Single User signup page', () => {
  const serverUri = 'https://localhost:7457'
  const port = 7457
  let ldp
  const rootDir = path.join(__dirname, '../resources/accounts/single-user/')
  const configPath = path.join(__dirname, '../resources/config')
  const server = supertest(serverUri)
  const dbPath = path.join(__dirname, '../resources/temp/7457/db')

  before(async () => {
    ldp = await ldnode.createServer({
      port,
      root: rootDir,
      configPath,
      dbPath,
      sslKey: path.join(__dirname, '../keys/key.pem'),
      sslCert: path.join(__dirname, '../keys/cert.pem'),
      webid: true,
      multiuser: false,
      skipWelcomePage: true,
      skipInitLocalRp: true
    })
    await promisify(ldp.listen.bind(ldp))(port)
  })

  after(() => {
    fs.removeSync(rootDir)
    fs.removeSync(dbPath)
    ldp.close()
  })

  it('should return a 401 unauthorized without accept text/html', async () => {
    return server.get('/')
      .set('accept', 'text/plain')
      .expect(401)
  })
})
