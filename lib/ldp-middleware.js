module.exports = addLdpMiddleware

const express = require('express')
const header = require('./header')
const allow = require('./handlers/allow')
// const get = require('./handlers/get')
// const post = require('./handlers/post')
// const put = require('./handlers/put')
// const del = require('./handlers/delete')
const patch = require('./handlers/patch')
// const index = require('./handlers/index')
const copy = require('./handlers/copy')

const { requestHandler } = require('./api/ldp/api')

function addLdpMiddleware ({ corsSettings, host, store }) {
  const router = express.Router('/')

  const handleLdpRequest = requestHandler({ host, store })

  // Add Link headers
  router.use(header.linksHandler)

  router.use(corsSettings)

  router.head('/*', handleLdpRequest)
  // router.get('/*', index, allow('Read'), header.addPermissions, get)
  router.get('/*', handleLdpRequest)
  // router.post('/*', allow('Append'), post)
  router.post('/*', handleLdpRequest)

  router.patch('/*', allow('Append'), patch)
  // router.put('/*', allow('Write'), put)
  router.put('/*', handleLdpRequest)
  // router.delete('/*', allow('Write'), del)
  router.delete('/*', handleLdpRequest)
  router.copy('/*', allow('Write'), copy)

  return router
}
