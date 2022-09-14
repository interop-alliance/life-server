const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
chai.use(require('chai-http'))
const { expect } = chai

const lfs = require('../../src')

const testDataDir = path.join(__dirname, '..', 'resources')

function resetTempDir () {
  fs.removeSync(path.join(testDataDir, 'temp'))
  fs.ensureDirSync(path.join(testDataDir, 'temp'))
}

let ldpServer

describe.skip('New HTTP tests', () => {
  let request
  before(async () => {
    ldpServer = await lfs.createServer({
      root: testDataDir,
      skipWelcomePage: true,
      webid: false
    })
    request = chai.request(ldpServer).keepOpen()
  })
  after(async () => {
    request.close()
  })

  describe('POST', () => {
    beforeEach(async () => {
      resetTempDir()
    })
    afterEach(async () => {
      resetTempDir()
    })

    it('should create a JSON resource', async () => {
      const writeResponse = await request
        .post('/temp/')
        .set('content-type', 'application/json')
        .send({ value1: '123', value2: '234' })
      expect(writeResponse).to.have.status(201)
      const relativeUrl = new URL(writeResponse.headers.location).pathname

      const readResponse = await request.get(relativeUrl)
      expect(readResponse.text).to.equal('{"value1":"123","value2":"234"}')
    })
  })

  describe('PUT', () => {
    beforeEach(async () => {
      resetTempDir()
    })
    afterEach(async () => {
      resetTempDir()
    })

    it('should create a JSON resource', async () => {
      const writeResponse = await request
        .put('/temp/test.json')
        .set('content-type', 'application/json')
        .send({ value1: '123', value2: '234' })
      expect(writeResponse).to.have.status(201)

      const relativeUrl = '/temp/test.json'

      const readResponse = await request.get(relativeUrl)

      expect(readResponse.text).to.equal('{"value1":"123","value2":"234"}')
    })
  })
})
