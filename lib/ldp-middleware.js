module.exports = addLdpMiddleware

const express = require('express')
const header = require('./header')
const allow = require('./handlers/allow')
const get = require('./handlers/get')
const post = require('./handlers/post')
const put = require('./handlers/put')
// const del = require('./handlers/delete')
const patch = require('./handlers/patch')
const index = require('./handlers/index')
const copy = require('./handlers/copy')

const LdpFileStore = require('./storage/ldp/ldp-file-store')
const LdpHttpHandler = require('./api/ldp/api')

function addLdpMiddleware ({corsSettings, host, mapper}) {
  const router = express.Router('/')

  const store = new LdpFileStore({ host, mapper })
  const ldp = new LdpHttpHandler({ store, host })

  // Add Link headers
  router.use(header.linksHandler)

  if (corsSettings) {
    router.use(corsSettings)
  }

  router.copy('/*', allow('Write'), copy)
  router.get('/*', index, allow('Read'), header.addPermissions, get)
  router.post('/*', allow('Append'), post)
  router.patch('/*', allow('Append'), patch)
  router.put('/*', allow('Write'), put)
  // router.delete('/*', allow('Write'), del)
  router.delete('/*', (req, res, next) => ldp.handleRequest(req, res, next))

  return router
}
