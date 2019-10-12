module.exports = addLdpMiddleware

const express = require('express')
const bodyParser = require('body-parser')

const { requestHandler } = require('./api')

function addLdpMiddleware ({ corsSettings }) {
  const router = express.Router('/')

  const handleLdpRequest = requestHandler()

  router.use(corsSettings)

  // Note: options handler is set in create-app
  router.head('/*', handleLdpRequest)
  router.get('/*', handleLdpRequest)
  router.post('/*', handleLdpRequest)
  router.put('/*', handleLdpRequest)
  router.delete('/*', handleLdpRequest)
  router.copy('/*', handleLdpRequest)
  router.patch('/*', bodyParser.text({ type: () => true }), handleLdpRequest)

  return router
}
