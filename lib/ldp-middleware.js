module.exports = addLdpMiddleware

const express = require('express')
const header = require('./header')
const allow = require('./handlers/allow')
const patch = require('./handlers/patch')
const copy = require('./handlers/copy')

const { requestHandler } = require('./api/ldp/api')

function addLdpMiddleware ({ corsSettings, host, store }) {
  const router = express.Router('/')

  const handleLdpRequest = requestHandler({ host, store })

  // Add Link headers
  router.use(header.linksHandler)

  router.use(corsSettings)

  router.head('/*', handleLdpRequest)
  router.get('/*', handleLdpRequest)
  router.post('/*', handleLdpRequest)
  router.put('/*', handleLdpRequest)
  router.delete('/*', handleLdpRequest)

  router.patch('/*', allow('Append'), patch)
  router.copy('/*', allow('Write'), copy)

  return router
}
