module.exports = createServer

const express = require('express')
const fs = require('fs')
const https = require('https')
const http = require('http')
const { logger } = require('./logger')
const createApp = require('./create-app')

function createServer (argv, app) {
  argv = argv || {}
  app = app || express()
  const ldpApp = createApp(argv)
  let mount = argv.mount || '/'
  // Removing ending '/'
  if (mount.length > 1 &&
    mount[mount.length - 1] === '/') {
    mount = mount.slice(0, -1)
  }
  app.use(mount, ldpApp)
  logger.info('Base URL (--mount): ' + mount)

  if (argv.idp) {
    console.warn('The idp configuration option has been renamed to multiuser.')
    argv.multiuser = argv.idp
    delete argv.idp
  }

  let server
  const needsTLS = argv.sslKey || argv.sslCert ||
                 (argv.webid || argv.multiuser) && !argv.certificateHeader
  if (!needsTLS) {
    server = http.createServer(app)
  } else {
    logger.info('SSL Private Key path: ' + argv.sslKey)
    logger.info('SSL Certificate path: ' + argv.sslCert)

    if (!argv.sslCert && !argv.sslKey) {
      throw new Error('Missing SSL cert and SSL key to enable WebIDs')
    }

    if (!argv.sslKey && argv.sslCert) {
      throw new Error('Missing path for SSL key')
    }

    if (!argv.sslCert && argv.sslKey) {
      throw new Error('Missing path for SSL cert')
    }

    let key
    try {
      key = fs.readFileSync(argv.sslKey)
    } catch (e) {
      throw new Error('Can\'t find SSL key in ' + argv.sslKey)
    }

    let cert
    try {
      cert = fs.readFileSync(argv.sslCert)
    } catch (e) {
      throw new Error('Can\'t find SSL cert in ' + argv.sslCert)
    }

    const credentials = Object.assign({
      key: key,
      cert: cert
    }, argv)

    server = https.createServer(credentials, app)
  }

  return server
}
