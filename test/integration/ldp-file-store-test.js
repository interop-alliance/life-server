const chai = require('chai')
chai.use(require('dirty-chai'))
const { expect } = chai
chai.should()
// const rdf = require('rdflib')
// const ns = require('solid-namespace')(rdf)
const path = require('path')
const ServerHost = require('../../src/server-host')
const LegacyResourceMapper = require('../../src/data-storage/ldp-backend-fs/legacy-resource-mapper')
const { LdpFileStore } = require('../../src/data-storage/ldp-backend-fs/ldp-file-store')

// Helper functions for the FS
// var rm = require('./../utils').rm
// var write = require('./../utils').write
// var cp = require('./utils').cp
// var read = require('./../utils').read
// var fs = require('fs')

const SERVER_URI = 'https://example.com'

describe('LdpFileStore', () => {
  const rootDir = path.join(__dirname, '..', 'resources')
  const host = ServerHost.from({
    serverUri: SERVER_URI,
    root: rootDir
  })
  const mapper = LegacyResourceMapper.from({ host })
  const ldpStore = new LdpFileStore({ host, mapper })

  describe('readBlob', () => {
    it('should throw if resource does not exist', async () => {
      const url = SERVER_URI + '/nonexistent.ttl'
      const resource = await ldpStore.resource({ target: { url } })
      let thrownError
      try {
        await ldpStore.readBlob({ resource })
      } catch (error) {
        thrownError = error
        expect(error.code).to.equal('ENOENT')
      }
      expect(thrownError).to.exist()
    })
  })

  it('should return resource contents if it exists', async () => {
    const url = SERVER_URI + '/fileExists.txt'
    const resource = await ldpStore.resource({ target: { url } })
    const contents = await ldpStore.readBlob({ resource })
    expect(contents.startsWith('hello world')).to.be.true()
  })
})

// TODO - change over to testing ldp-file-store
// describe.skip('LDP', function () {
//   var ldp
//   //   = new LDP({
//   //   suffixMeta,
//   //   root: path.join(__dirname, '..'),
//   //   webid: false
//   // })
//
//   describe('readContainerMeta', function () {
//     it('should return 404 if .meta is not found', function (done) {
//       ldp.readContainerMeta('resources/', function (err) {
//         assert.equal(err.status, 404)
//         done()
//       })
//     })
//
//     it('should return content if metaFile exists', function (done) {
//       // file can be empty as well
//       write('This function just reads this, does not parse it', '.meta')
//       ldp.readContainerMeta(path.join(__dirname, '../resources/'), function (err, metaFile) {
//         rm('.meta')
//         assert.notOk(err)
//         assert.equal(metaFile, 'This function just reads this, does not parse it')
//         done()
//       })
//     })
//
//     it('should work also if trailing `/` is not passed', function (done) {
//       // file can be empty as well
//       write('This function just reads this, does not parse it', '.meta')
//       ldp.readContainerMeta(path.join(__dirname, '../resources'), function (err, metaFile) {
//         rm('.meta')
//         assert.notOk(err)
//         assert.equal(metaFile, 'This function just reads this, does not parse it')
//         done()
//       })
//     })
//   })
//
//   describe('getGraph', () => {
//     it('should read and parse an existing file', () => {
//       let uri = 'https://localhost:8443/resources/sampleContainer/example1.ttl'
//       return ldp.getGraph(uri)
//         .then(graph => {
//           assert.ok(graph)
//           let fullname = rdf.namedNode('http://example.org/stuff/1.0/fullname')
//           let match = graph.match(null, fullname)
//           assert.equal(match[0].object.value, 'Dave Beckett')
//         })
//     })
//
//     it('should throw a 404 error on a non-existing file', (done) => {
//       let uri = 'https://localhost:8443/resources/nonexistent.ttl'
//       ldp.getGraph(uri)
//         .catch(error => {
//           assert.ok(error)
//           assert.equal(error.status, 404)
//           done()
//         })
//     })
//   })
//
//   describe('putGraph', () => {
//     after(() => {
//       rm('sampleContainer/example1-copy.ttl')
//     })
//
//     it('should serialize and write a graph to a file', () => {
//       let originalResource = '/resources/sampleContainer/example1.ttl'
//       let newResource = '/resources/sampleContainer/example1-copy.ttl'
//
//       let uri = 'https://localhost:8443' + originalResource
//       return ldp.getGraph(uri)
//         .then(graph => {
//           let newUri = 'https://localhost:8443' + newResource
//           return ldp.putGraph(graph, newUri)
//         })
//         .then(() => {
//           // Graph serialized and written
//           let written = read('sampleContainer/example1-copy.ttl')
//           assert.ok(written)
//         })
//     })
//   })
//
//   describe('put', function () {
//     before(() => {
//       rm('testPut.txt')
//     })
//
//     after(() => {
//       rm('new-container/')
//       rm('new-container2/')
//     })
//
//     it('should write a file in an existing dir', function (done) {
//       var stream = stringToStream('hello world')
//       ldp.put('localhost', '/resources/testPut.txt', stream, function (err) {
//         assert.notOk(err)
//         var found = read('testPut.txt')
//         rm('testPut.txt')
//         assert.equal(found, 'hello world')
//         done()
//       })
//     })
//
//     it('should create a new container', done => {
//       const containerMeta = '<> dcterms:title "Home loans".'
//       const stream = stringToStream(containerMeta)
//
//       ldp.put('localhost', '/resources/new-container/', stream, (err, status) => {
//         if (err) { return done(err) }
//
//         assert.equal(status, 201)
//
//         let written = read('new-container/' + META_SUFFIX)
//         assert.equal(written, containerMeta)
//
//         done()
//       })
//     })
//
//     it('should update existing container meta', done => {
//       const containerMeta = '<> dcterms:title "Home loans".'
//       const newMeta = '<> dcterms:title "Car loans".'
//
//       let stream = stringToStream(containerMeta)
//
//       ldp.put('localhost', '/resources/new-container2/', stream, (err, status) => {
//         if (err) { return done(err) }
//
//         assert.equal(status, 201)
//
//         stream = stringToStream(newMeta)
//
//         ldp.put('localhost', '/resources/new-container2/', stream, (err, status) => {
//           if (err) { return done(err) }
//
//           assert.equal(status, 204)
//
//           let written = read('new-container2/' + META_SUFFIX)
//           assert.equal(written, newMeta)
//
//           done()
//         })
//       })
//     })
//   })
//
//   describe('delete', function () {
//     it('should delete a file in an existing dir', function (done) {
//       var stream = stringToStream('hello world')
//       ldp.put('localhost', '/resources/testPut.txt', stream, function (err) {
//         assert.notOk(err)
//         fs.stat(ldp.root + '/resources/testPut.txt', function (err) {
//           if (err) {
//             return done(err)
//           }
//           ldp.delete('localhost', '/resources/testPut.txt', function (err) {
//             if (err) done(err)
//             fs.stat(ldp.root + '/resources/testPut.txt', function (err) {
//               return done(err ? null : new Error('file still exists'))
//             })
//           })
//         })
//       })
//     })
//   })
//   describe('listContainer', function () {
//     /*
//     it('should inherit type if file is .ttl', function (done) {
//       write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
//         '@prefix o: <http://example.org/ontology>.' +
//         '<> a <http://www.w3.org/ns/ldp#MagicType> ;' +
//         '   dcterms:title "This is a magic type" ;' +
//         '   o:limit 500000.00 .', 'sampleContainer/magicType.ttl')
//
//       ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
//         if (err) done(err)
//         var graph = $rdf.graph()
//         $rdf.parse(
//           data,
//           graph,
//           'https://server.tld/sampleContainer',
//           'text/turtle')
//
//         var statements = graph
//           .each(
//             $rdf.sym('https://server.tld/magicType.ttl'),
//             ns.rdf('type'),
//             undefined)
//           .map(function (d) {
//             return d.uri
//           })
//         // statements should be:
//         // [ 'http://www.w3.org/ns/iana/media-types/text/turtle#Resource',
//         //   'http://www.w3.org/ns/ldp#MagicType',
//         //   'http://www.w3.org/ns/ldp#Resource' ]
//         assert.equal(statements.length, 3)
//         assert.isAbove(statements.indexOf('http://www.w3.org/ns/ldp#MagicType'), -1)
//         assert.isAbove(statements.indexOf('http://www.w3.org/ns/ldp#Resource'), -1)
//
//         rm('sampleContainer/magicType.ttl')
//         done()
//       })
//     })
// */
//     it('should not inherit type of BasicContainer/Container if type is File', function (done) {
//       write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
//         '@prefix o: <http://example.org/ontology>.' +
//         '<> a <http://www.w3.org/ns/ldp#Container> ;' +
//         '   dcterms:title "This is a container" ;' +
//         '   o:limit 500000.00 .', 'sampleContainer/containerFile.ttl')
//
//       write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
//         '@prefix o: <http://example.org/ontology>.' +
//         '<> a <http://www.w3.org/ns/ldp#BasicContainer> ;' +
//         '   dcterms:title "This is a container" ;' +
//         '   o:limit 500000.00 .', 'sampleContainer/basicContainerFile.ttl')
//
//       ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
//         if (err) done(err)
//         var graph = rdf.graph()
//         rdf.parse(
//           data,
//           graph,
//           'https://server.tld/sampleContainer',
//           'text/turtle')
//
//         var basicContainerStatements = graph
//           .each(
//             rdf.sym('https://server.tld/basicContainerFile.ttl'),
//             ns.rdf('type'),
//             undefined
//           )
//           .map(d => { return d.uri })
//
//         let expectedStatements = [
//           'http://www.w3.org/ns/iana/media-types/text/turtle#Resource',
//           'http://www.w3.org/ns/ldp#Resource'
//         ]
//         assert.deepEqual(basicContainerStatements.sort(), expectedStatements)
//
//         var containerStatements = graph
//           .each(
//             rdf.sym('https://server.tld/containerFile.ttl'),
//             ns.rdf('type'),
//           undefined
//           )
//           .map(d => { return d.uri })
//
//         assert.deepEqual(containerStatements.sort(), expectedStatements)
//
//         rm('sampleContainer/containerFile.ttl')
//         rm('sampleContainer/basicContainerFile.ttl')
//         done()
//       })
//     })
//
//     it('should ldp:contains the same files in dir', function (done) {
//       ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
//         if (err) done(err)
//         fs.readdir(path.join(__dirname, '../resources/sampleContainer/'), function (err, expectedFiles) {
//           const graph = rdf.graph()
//           rdf.parse(data, graph, 'https://server.tld/sampleContainer/', 'text/turtle')
//           const statements = graph.match(null, ns.ldp('contains'), null)
//           const files = statements
//             .map(s => s.object.value.replace(/.*\//, ''))
//             .map(decodeURIComponent)
//
//           files.sort()
//           expectedFiles.sort()
//           assert.deepEqual(files, expectedFiles)
//           done(err)
//         })
//       })
//     })
//   })
// })
