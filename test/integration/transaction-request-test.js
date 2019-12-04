const Solid = require('../../index')
const path = require('path')
const fs = require('fs-extra')

const chai = require('chai')
const { expect } = chai
chai.use(require('dirty-chai'))
chai.should()

const { startServer } = require('../utils')
const request = require('supertest')

const port = 8881
const serverUri = 'https://localhost:' + port

const configPath = path.join(__dirname, '../resources/config')
const rootPath = path.join(__dirname, '../resources/temp/tx-request/')
const dbPath = path.join(__dirname, '../resources/temp/tx-request/db')

let server

before(async () => {
  server = await Solid.createServer({
    root: rootPath,
    configPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    webid: true,
    multiuser: false,
    skipWelcomePage: true,
    dbPath,
    serverUri
  })

  return startServer(server, port)
})

after(async () => {
  server.close()
  return fs.remove(rootPath)
})

describe('TransactionRequest', () => {
  describe('new transaction', () => {
    it('should reject a transaction with no keys or resource', async () => {
      const response = await request(server)
        .post('/transaction')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400)

      expect(response.text).to
        .match(/"keys" or "key_handle" parameter is required/)
    })

    it('should reject a transaction with no keys or resource', async () => {
      const response = await request(server)
        .post('/transaction')
        .set('Content-Type', 'application/json')
        .send({ keys: { jwks: [] } })
        .expect(400)

      expect(response.text).to.match(/"resources" or "resource_handle" parameter is required/)
    })

    it('should reject a transaction with no interact param', async () => {
      const response = await request(server)
        .post('/transaction')
        .set('Content-Type', 'application/json')
        .send({ keys: { jwks: [] }, resources: ['scope1'] })
        .expect(400)

      expect(response.text).to
        .match(/"interact" parameter is required/)
    })

    it('should return a handle if transaction is valid', async () => {
      const response = await request(server)
        .post('/transaction')
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .send({
          keys: { jwks: [] }, resources: ['scope1'], interact: { redirect: true }
        })
        .expect(200)

      expect(response.body).to.have.property('handle')
      console.log('Response:', response.body)
    })
  })
})
