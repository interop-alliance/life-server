/**
 * Settings for headers in common to all requests (whether related to user
 * account management, authentication and authorization, or data storage).
 */
'use strict'

const cors = require('cors')
const { version } = require('../../package.json')

const corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE', 'COPY'
  ],
  exposedHeaders: 'Authorization, User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Updates-Via, Allow, WAC-Allow, Content-Length, WWW-Authenticate, Source',
  credentials: true,
  maxAge: 1728000,
  origin: true,
  preflightContinue: true
})

/**
 * Sets up headers common to all requests (CORS-related, Allow, etc).
 *
 * @param app {Function} Express.js app instance
 */
function initHeaders (app) {
  app.use(corsSettings)

  app.use((req, res, next) => {
    res.set('X-Powered-By', 'Life Server/' + version)

    res.set('Vary', 'Accept, Authorization, Origin')

    // Set default Allow methods
    res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')
    next()
  })
}

module.exports = {
  corsSettings,
  initHeaders
}
