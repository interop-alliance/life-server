const supertest = require('supertest')
const fs = require('fs-extra')
const li = require('li')
const lfs = require('../../index')
const { rm } = require('./../utils')
const path = require('path')
const chai = require('chai')
const { assert, expect } = chai
chai.use(require('dirty-chai'))
// const rdf = require('rdflib')

const { ACL_SUFFIX, META_SUFFIX } = require('../../lib/defaults')

let ldpServer, server

before(async () => {
  ldpServer = await lfs.createServer({
    root: path.join(__dirname, '../resources'),
    skipWelcomePage: true,
    webid: false
  })
  server = supertest(ldpServer)
})

/**
 * Creates a new test basic container via an LDP POST
 *   (located in `test/resources/{containerName}`)
 * @method createTestContainer
 * @param containerName {String} Container name used as slug, no leading `/`
 * @return {Promise} Promise obj, for use with Mocha's `before()` etc
 */
function createTestContainer (containerName) {
  return new Promise(function (resolve, reject) {
    server.post('/')
      .set('content-type', 'text/turtle')
      .set('slug', containerName)
      .set('link', '<http://www.w3.org/ns/ldp#Container>; rel="type"')
      .end(function (error, res) {
        error ? reject(error) : resolve(res)
      })
  })
}

/**
 * Creates a new turtle test resource via an LDP PUT
 *   (located in `test/resources/{resourceName}`)
 * @method createTestResource
 * @param resourceName {String} Resource name (should have a leading `/`)
 * @return {Promise} Promise obj, for use with Mocha's `before()` etc
 */
function createTestResource (resourceName) {
  return new Promise(function (resolve, reject) {
    server.put(resourceName)
      .set('content-type', 'text/turtle')
      .end(function (error, res) {
        error ? reject(error) : resolve(res)
      })
  })
}

describe('HTTP APIs', function () {
  var emptyResponse = function (res) {
    if (res.text) {
      console.log('Not empty response')
    }
  }
  var getLink = function (res, rel) {
    var links = res.headers.link.split(',')
    for (var i in links) {
      var link = links[i]
      var parsedLink = li.parse(link)
      if (parsedLink[rel]) {
        return parsedLink[rel]
      }
    }
    return undefined
  }
  var hasHeader = function (rel, value) {
    var handler = function (res) {
      var link = getLink(res, rel)
      if (link) {
        if (link !== value) {
          console.log('Not same value:', value, '!=', link)
        }
      } else {
        console.log(rel, 'header does not exist:', link)
      }
    }
    return handler
  }

  describe('GET Root container', function () {
    it('should exist', function (done) {
      server.get('/')
        .expect(200, done)
    })
    it('should be a turtle file by default', function (done) {
      server.get('/')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
  })

  describe('OPTIONS API', function () {
    it('should set the proper CORS headers',
      function (done) {
        server.options('/')
          .set('Origin', 'http://example.com')
          .expect('Access-Control-Allow-Origin', 'http://example.com')
          .expect('Access-Control-Allow-Credentials', 'true')
          .expect('Access-Control-Allow-Methods', 'OPTIONS,HEAD,GET,PATCH,POST,PUT,DELETE,COPY')
          .expect('Access-Control-Expose-Headers', 'Authorization, User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Updates-Via, Allow, WAC-Allow, Content-Length, WWW-Authenticate, Source')
          .expect(204, done)
      })

    describe('Accept-Patch header', function () {
      it('should be present for resources', function (done) {
        server.options('/sampleContainer/example1.ttl')
          .expect('Accept-Patch', 'application/sparql-update')
          .expect(204, done)
      })

      it('should be present for containers', function (done) {
        server.options('/sampleContainer/')
          .expect('Accept-Patch', 'application/sparql-update')
          .expect(204, done)
      })

      it('should be present for non-rdf resources', function (done) {
        server.options('/sampleContainer/solid.png')
          .expect('Accept-Patch', 'application/sparql-update')
          .expect(204, done)
      })
    })

    it('should have an empty response', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect(emptyResponse)
        .end(done)
    })

    it('should return 204 on success', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect(204)
        .end(done)
    })

    it('should have Access-Control-Allow-Origin', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .end(done)
    })

    it('should have set acl and describedBy Links for resource',
      function (done) {
        server.options('/sampleContainer/example1.ttl')
          .expect(hasHeader('acl', 'example1.ttl' + ACL_SUFFIX))
          .expect(hasHeader('describedBy', 'example1.ttl' + META_SUFFIX))
          .end(done)
      })

    it('should have set Link as resource', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .end(done)
    })

    it('should have set Link as Container/BasicContainer', function (done) {
      server.options('/sampleContainer/')
        .set('Origin', 'http://example.com')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .end(done)
    })

    it('should have set Accept-Post for containers', function (done) {
      server.options('/sampleContainer/')
        .set('Origin', 'http://example.com')
        .expect('Accept-Post', '*/*')
        .end(done)
    })

    it('should have set acl and describedBy Links for container', function (done) {
      server.options('/sampleContainer/')
        .expect(hasHeader('acl', ACL_SUFFIX))
        .expect(hasHeader('describedBy', META_SUFFIX))
        .end(done)
    })
  })

  describe('GET API', function () {
    it('should have the same size of the file on disk', function (done) {
      server.get('/sampleContainer/solid.png')
        .expect(200)
        .end(function (err, res) {
          if (err) {
            return done(err)
          }

          var size = fs.statSync(path.join(__dirname,
            '../resources/sampleContainer/solid.png')).size
          if (res.body.length !== size) {
            return done(new Error('files are not of the same size'))
          }
          done()
        })
    })

    it('should have Access-Control-Allow-Origin as Origin on containers', function (done) {
      server.get('/sampleContainer/')
        .set('Origin', 'http://example.com')
        .expect('content-type', /text\/turtle/)
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })
    it('should have Access-Control-Allow-Origin as Origin on resources',
      function (done) {
        server.get('/sampleContainer/example1.ttl')
          .set('Origin', 'http://example.com')
          .expect('content-type', /text\/turtle/)
          .expect('Access-Control-Allow-Origin', 'http://example.com')
          .expect(200, done)
      })
    it('should have set Link as resource', function (done) {
      server.get('/sampleContainer/example1.ttl')
        .expect('content-type', /text\/turtle/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect(200, done)
    })
    it('should have set acl and describedBy Links for resource',
      function (done) {
        server.get('/sampleContainer/example1.ttl')
          .expect('content-type', /text\/turtle/)
          .expect(hasHeader('acl', 'example1.ttl' + ACL_SUFFIX))
          .expect(hasHeader('describedBy', 'example1.ttl' + META_SUFFIX))
          .end(done)
      })
    it('should have set Link as Container/BasicContainer', function (done) {
      server.get('/sampleContainer/')
        .expect('content-type', /text\/turtle/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .expect(200, done)
    })
    it('should load data viewer if resource was requested as text/html', function (done) {
      server.get('/sampleContainer/example1.ttl')
        .set('Accept', 'text/html')
        .expect('content-type', /text\/html/)
        .expect(200, done) // Can't check for 303 because of internal redirects
    })
    it('should NOT load data viewer if resource is not RDF', function (done) {
      server.get('/sampleContainer/solid.png')
        .set('Accept', 'text/html')
        .expect('content-type', /image\/png/)
        .expect(200, done)
    })

    it('should NOT load data viewer if a resource has an .html extension', function (done) {
      server.get('/sampleContainer/index.html')
        .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        .expect('content-type', /text\/html/)
        .expect(200)
        .expect((res) => {
          if (res.text.includes('TabulatorOutline')) {
            throw new Error('Loaded data browser though resource has an .html extension')
          }
        })
        .end(done)
    })

    it('should show data browser if container was requested as text/html', function (done) {
      server.get('/sampleContainer2/')
        .set('Accept', 'text/html')
        .expect('content-type', /text\/html/)
        .expect(200, done)
    })
    // FIXME: CLarify this in spec
    it.skip('should redirect to the right container URI if missing /', function (done) {
      server.get('/sampleContainer')
        .expect(301, done)
    })
    it('should return 404 for non-existent resource', function (done) {
      server.get('/invalidfile.foo')
        .expect(404, done)
    })
    it('should return basic container link for directories', function (done) {
      server.get('/')
        .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#BasicContainer/)
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
    it('should return resource link for files', function (done) {
      server.get('/hello.html')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect('Content-Type', /text\/html/)
        .expect(200, done)
    })
    it('should have set acl and describedBy Links for container',
      function (done) {
        server.get('/sampleContainer/')
          .expect(hasHeader('acl', ACL_SUFFIX))
          .expect(hasHeader('describedBy', META_SUFFIX))
          .expect('content-type', /text\/turtle/)
          .end(done)
      })
    it('should return requested index.html resource by default', function (done) {
      server.get('/sampleContainer/index.html')
        .set('accept', 'text/html')
        .expect(200)
        .expect('content-type', /text\/html/)
        .expect(function (res) {
          if (res.text.indexOf('<!doctype html>') < 0) {
            throw new Error('wrong content returned for index.html')
          }
        })
        .end(done)
    })
    it('should fallback on index.html if it exists and content-type is given',
      function (done) {
        server.get('/sampleContainer/')
          .set('accept', 'text/html')
          .expect(200)
          .expect('content-type', /text\/html/)
          .end(done)
      })
    // TODO: Clarify this on the spec
    it.skip('should still redirect to the right container URI if missing / and HTML is requested',
      function (done) {
        server.get('/sampleContainer')
          .set('accept', 'text/html')
          .expect('location', /\/sampleContainer\//)
          .expect(301, done)
      })
  })

  describe('HEAD API', function () {
    it('should return content-type text by default', function (done) {
      server.head('/sampleContainer/blank')
        .expect('Content-Type', 'text/plain; charset=utf-8')
        .end(done)
    })
    it('should have set content-type for turtle files',
      function (done) {
        server.head('/sampleContainer/example1.ttl')
          .expect('Content-Type', 'text/turtle; charset=utf-8')
          .end(done)
      })
    it('should have set content-type for image files',
      function (done) {
        server.head('/sampleContainer/solid.png')
          .expect('Content-Type', 'image/png; charset=utf-8')
          .end(done)
      })
    it('should have Access-Control-Allow-Origin as Origin', function (done) {
      server.head('/sampleContainer/example1.ttl')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })
    it('should return empty response body', function (done) {
      server.head('/patch-5-initial.ttl')
        .expect(emptyResponse)
        .expect(200, done)
    })
    it('should have set Link as Resource', function (done) {
      server.head('/sampleContainer/example1.ttl')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect(200, done)
    })
    it('should have set acl and describedBy Links for resource',
      function (done) {
        server.get('/sampleContainer/example1.ttl')
          .expect(hasHeader('acl', 'example1.ttl' + ACL_SUFFIX))
          .expect(hasHeader('describedBy', 'example1.ttl' + META_SUFFIX))
          .end(done)
      })
    it('should have set Link as Container/BasicContainer',
      function (done) {
        server.get('/sampleContainer/')
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
          .expect(200, done)
      })
    it('should have set acl and describedBy Links for container',
      function (done) {
        server.get('/sampleContainer/')
          .expect(hasHeader('acl', ACL_SUFFIX))
          .expect(hasHeader('describedBy', META_SUFFIX))
          .end(done)
      })
  })

  describe('PUT API', function () {
    var putRequestBody = fs.readFileSync(path.join(__dirname,
      '../resources/sampleContainer/put1.ttl'), {
      encoding: 'utf8'
    })
    it('should create new resource', function (done) {
      server.put('/put-resource-1.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(201, done)
    })
    it('should create directories if they do not exist', function (done) {
      server.put('/foo/bar/baz.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(hasHeader('describedBy', 'baz.ttl' + META_SUFFIX))
        .expect(hasHeader('acl', 'baz.ttl' + ACL_SUFFIX))
        .expect(201, done)
    })

    describe('PUT and containers', () => {
      const containerMeta = fs.readFileSync(path.join(__dirname,
        '../resources/sampleContainer/post2.ttl'),
      { encoding: 'utf8' })

      after(() => {
        rm('/foo/')
      })

      it('should create a container (implicit from url)', () => {
        return server.put('/foo/two/')
          .expect(201)
          .then(() => {
            const stats = fs.statSync(path.join(__dirname, '../resources/foo/two/'))

            assert(stats.isDirectory(), 'Cannot read container just created')
          })
      })

      // TODO: Revisit this once this gets standardized
      it.skip('should create a container (explicit from link header)', () => {
        return server.put('/foo/three')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .expect(201)
          .then(() => {
            const stats = fs.statSync(path.join(__dirname, '../resources/foo/three/'))

            assert(stats.isDirectory(), 'Cannot read container just created')
          })
      })

      // TODO: Revisit this once this gets standardized
      it.skip('should write the request body to the container .meta', () => {
        return server.put('/foo/four/')
          .set('content-type', 'text/turtle')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .send(containerMeta)
          .expect(201)
          .then(() => {
            const metaFilePath = path.join(__dirname, '../resources/foo/four/' + META_SUFFIX)
            const meta = fs.readFileSync(metaFilePath, 'utf8')

            assert.equal(meta, containerMeta)
          })
      })

      // TODO: Revisit this once this gets standardized
      it.skip('should update existing container .meta', () => {
        const newMeta = '<> dcterms:title "Home loans".'

        return server.put('/foo/five/')
          .set('content-type', 'text/turtle')
          .send(containerMeta)
          .expect(201)
          .then(() => {
            return server.put('/foo/five/')
              .set('content-type', 'text/turtle')
              .send(newMeta)
              .expect(204)
          })
          .then(() => {
            const metaFilePath = path.join(__dirname, '../resources/foo/five/' + META_SUFFIX)
            const meta = fs.readFileSync(metaFilePath, 'utf8')

            assert.equal(meta, newMeta)
          })
      })
    })
  })

  describe('DELETE API', function () {
    before(function () {
      // Ensure all these are finished before running tests
      return Promise.all([
        rm('/false-file-48484848'),
        createTestContainer('delete-test-empty-container'),
        createTestResource('/put-resource-1.ttl'),
        createTestResource('/delete-test-non-empty/test.ttl')
      ])
    })

    it('should return 404 status when deleting a file that does not exists',
      function (done) {
        server.delete('/false-file-48484848')
          .expect(404, done)
      })

    it('should delete previously PUT file', function (done) {
      server.delete('/put-resource-1.ttl')
        .expect(200, done)
    })

    it('should fail to delete non-empty containers', function (done) {
      server.delete('/delete-test-non-empty/')
        .expect(409, done)
    })

    it('should delete a new and empty container', function (done) {
      server.delete('/delete-test-empty-container/')
        .end(() => {
          server.get('/delete-test-empty-container/')
            .expect(404)
            .end(done)
        })
    })

    after(function () {
      // Clean up after DELETE API tests
      rm('/put-resource-1.ttl')
      rm('/delete-test-non-empty/')
      rm('/delete-test-empty-container/')
    })
  })

  describe('POST API', function () {
    before(function () {
      // Ensure all these are finished before running tests
      return Promise.all([
        createTestContainer('post-tests'),
        rm('post-test-target.ttl')
        // createTestResource('/put-resource-1.ttl'),
      ])
    })

    var postRequest1Body = fs.readFileSync(path.join(__dirname,
      '../resources/sampleContainer/put1.ttl'), {
      encoding: 'utf8'
    })
    var postRequest2Body = fs.readFileSync(path.join(__dirname,
      '../resources/sampleContainer/post2.ttl'), {
      encoding: 'utf8'
    })
    it('should create new resource', function (done) {
      server.post('/post-tests/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'post-resource-1')
        .expect('location', /\/post-resource-1/)
        .expect(hasHeader('describedBy', META_SUFFIX))
        .expect(hasHeader('acl', ACL_SUFFIX))
        .expect(201, done)
    })
    it('should create new resource even if no trailing / is in the target',
      function (done) {
        server.post('/')
          .send(postRequest1Body)
          .set('content-type', 'text/turtle')
          .set('slug', 'post-test-target')
          .expect('location', /\/post-test-target\.ttl/)
          .expect(hasHeader('describedBy', META_SUFFIX))
          .expect(hasHeader('acl', ACL_SUFFIX))
          .expect(201, done)
      })
    it('should fail return 404 if no parent container found', function (done) {
      server.post('/hello.html/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'post-test-target2')
        .expect(404, done)
    })
    it('should create a new slug if there is a resource with the same name',
      function (done) {
        server.post('/post-tests/')
          .send(postRequest1Body)
          .set('content-type', 'text/turtle')
          .set('slug', 'post-resource-1')
          .expect(201, done)
      })
    it('should be able to delete newly created resource', function (done) {
      server.delete('/post-tests/post-resource-1.ttl')
        .expect(200, done)
    })
    // Capture the resource name generated by server by parsing Location: header
    var postedResourceName
    var getResourceName = function (res) {
      postedResourceName = res.header.location
    }
    it('should create new resource without slug header', function (done) {
      server.post('/post-tests/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .expect(201)
        .expect(getResourceName)
        .end(done)
    })
    it('should be able to delete newly created resource', function (done) {
      server.delete('/' +
          postedResourceName.replace(/https?:\/\/127.0.0.1:[0-9]*\//, ''))
        .expect(200, done)
    })
    it('should create container', function (done) {
      server.post('/post-tests/')
        .set('content-type', 'text/turtle')
        .set('slug', 'loans')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .send(postRequest2Body)
        .expect(201)
        .end(function (err) {
          if (err) return done(err)
          var stats = fs.statSync(path.join(__dirname, '../resources/post-tests/loans/'))
          if (!stats.isDirectory()) {
            return done(new Error('Cannot read container just created'))
          }
          done()
        })
    })
    it('should be able to access newly container', function (done) {
      server.get('/post-tests/loans/')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })

    it('should create a container with a name hex decoded from the slug', (done) => {
      const containerName = 'Film%4011'
      const expectedDirName = '/post-tests/Film@11/'
      server.post('/post-tests/')
        .set('slug', containerName)
        .set('content-type', 'text/turtle')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .expect(201)
        .end((err, res) => {
          if (err) return done(err)
          try {
            assert(res.headers.location.endsWith(expectedDirName),
              'Uri container names should be encoded')
            const createdDir = fs.statSync(path.join(__dirname, '../resources', expectedDirName))
            assert(createdDir.isDirectory(), 'Container should have been created')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })

    describe('content-type-based file extensions', () => {
      // ensure the container exists
      before(() =>
        server.post('/post-tests/')
          .send(postRequest1Body)
          .set('content-type', 'text/turtle')
      )

      describe('a new text/turtle document posted without slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('content-type', 'text/turtle; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .ttl extension', () => {
          expect(response.headers).to.have.property('location')
          expect(response.headers.location).to.match(/\/post-tests\/[^./]+\.ttl$/)
        })
      })

      describe('a new text/turtle document posted with a slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('slug', 'slug1')
            .set('content-type', 'text/turtle; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .ttl extension', () => {
          expect(response.headers.location.endsWith('/post-tests/slug1.ttl')).to.be.true()
        })
      })

      describe('a new text/html document posted without slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('content-type', 'text/html; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .html extension', () => {
          expect(response.headers).to.have.property('location')
          expect(response.headers.location).to.match(/\/post-tests\/[^./]+\.html$/)
        })
      })

      describe('a new text/html document posted with a slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('slug', 'slug2')
            .set('content-type', 'text/html; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .html extension', () => {
          expect(response.headers.location.endsWith('/post-tests/slug2.html'))
            .to.be.true()
        })
      })
    })

    // No, URLs are NOT ex-encoded to make filenames -- the other way around.
    it.skip('should create a container with a url name', (done) => {
      const containerName = 'https://example.com/page'
      const expectedDirName = '/post-tests/https%3A%2F%2Fexample.com%2Fpage/'
      server.post('/post-tests/')
        .set('slug', containerName)
        .set('content-type', 'text/turtle')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .expect(201)
        .end((err, res) => {
          if (err) return done(err)
          try {
            assert.equal(res.headers.location, expectedDirName,
              'Uri container names should be encoded')
            const createdDir = fs.statSync(path.join(__dirname, 'resources', expectedDirName))
            assert(createdDir.isDirectory(), 'Container should have been created')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })

    it.skip('should be able to access new url-named container', (done) => {
      const containerUrl = '/post-tests/https%3A%2F%2Fexample.com%2Fpage/'
      server.get(containerUrl)
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })

    after(function () {
      // Clean up after POST API tests
      return Promise.all([
        rm('/post-tests/'),
        rm('post-test-target.ttl')
      ])
    })
  })

  describe('POST (multipart)', function () {
    it('should create as many files as the ones passed in multipart',
      function (done) {
        server.post('/sampleContainer/')
          .attach('timbl', path.join(__dirname, '../resources/timbl.jpg'))
          .attach('nicola', path.join(__dirname, '../resources/nicola.jpg'))
          .expect(201)
          .end(function (err) {
            if (err) return done(err)

            var sizeNicola = fs.statSync(path.join(__dirname,
              '../resources/nicola.jpg')).size
            var sizeTim = fs.statSync(path.join(__dirname, '../resources/timbl.jpg')).size
            var sizeNicolaLocal = fs.statSync(path.join(__dirname,
              '../resources/sampleContainer/nicola.jpg')).size
            var sizeTimLocal = fs.statSync(path.join(__dirname,
              '../resources/sampleContainer/timbl.jpg')).size

            if (sizeNicola === sizeNicolaLocal && sizeTim === sizeTimLocal) {
              return done()
            } else {
              return done(new Error('Either the size (remote/local) don\'t match or files are not stored'))
            }
          })
      })
    after(function () {
      // Clean up after POST (multipart) API tests
      return Promise.all([
        rm('/sampleContainer/nicola.jpg'),
        rm('/sampleContainer/timbl.jpg')
      ])
    })
  })
})
