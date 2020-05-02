'use strict'
/**
 * Server config initialization utilities
 */

const fs = require('fs-extra')
const path = require('path')
const { v1: uuidv1 } = require('uuid')
const session = require('express-session')
const { AccountTemplate, processHandlebarFile } = require('./account-mgmt/account-template')
const { logger } = require('./logger')

function printDebugInfo (options) {
  logger.info('Server URI: ' + options.serverUri)
  logger.info('Auth method: ' + options.auth)
  logger.info('Db path: ' + options.dbPath)
  logger.info('Config path: ' + options.configPath)
  logger.info('Filesystem Root: ' + options.root)
  logger.info('Allow WebID authentication: ' + !!options.webid)
  logger.info('Multi-user: ' + !!options.multiuser)
  if (options.couchdb) {
    logger.info('CouchDB server: ' + options.couchdb.url)
  }
}

function hostConfigFor (argv) {
  return {
    port: argv.port,
    serverUri: argv.serverUri,
    root: argv.root,
    multiuser: argv.multiuser,
    webid: argv.webid
  }
}

/**
 * Creates (copies from the server templates dir) a Welcome index page for the
 * server root web directory, if one does not already exist. This page
 * typically has links to account signup and login, and can be overridden by
 * the server operator.
 *
 * @param argv {Object} App config object
 */
async function ensureWelcomePage ({ root, multiuser, templates, server, host, storage }) {
  const serverTemplate = path.join(__dirname, '../default-templates/server')
  const rootDir = path.resolve(root)
  const serverRootDir = multiuser ? path.join(rootDir, host.hostname) : rootDir
  const existingIndexPage = path.join(serverRootDir, 'index.html')
  const packageData = require('../package.json')

  if (!fs.existsSync(existingIndexPage)) {
    fs.mkdirp(serverRootDir)
    await AccountTemplate.copyTemplateContainer({
      templatePath: serverTemplate,
      accountPath: serverRootDir
    })
    await processHandlebarFile(existingIndexPage, {
      serverName: server ? server.name : host.hostname,
      serverDescription: server ? server.description : '',
      serverLogo: server ? server.logo : '',
      serverVersion: packageData.version
    })
  }
}

function initSessionHandler ({ app, useSecureCookies, host }) {
  // Store the user's session key in a cookie
  // (for same-domain browsing by people only)
  const sessionHandler = session(sessionSettings(useSecureCookies, host))
  app.use((req, res, next) => {
    sessionHandler(req, res, () => {
      // Reject cookies from third-party applications.
      // Otherwise, when a user is logged in to their server,
      // any third-party application could perform authenticated requests
      // without permission by including the credentials set by the server.
      const origin = req.headers.origin
      const userId = req.session.userId
      if (!host.allowsSessionFor(userId, origin)) {
        logger.warn(`Rejecting session for ${userId} from ${origin}`)
        // Destroy session data
        delete req.session.userId
        // Ensure this modified session is not saved
        req.session.save = (done) => done()
      }
      next()
    })
  })
}

/**
 * Returns a settings object for Express.js sessions.
 *
 * @param secureCookies {boolean}
 * @param host {ServerHost}
 *
 * @return {Object} `express-session` settings object
 */
function sessionSettings (secureCookies, host) {
  const sessionSettings = {
    secret: uuidv1(),
    saveUninitialized: false,
    resave: false,
    rolling: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000
    }
  }
  // Cookies should set to be secure if https is on
  if (secureCookies) {
    sessionSettings.cookie.secure = true
  }

  // Determine the cookie domain
  sessionSettings.cookie.domain = host.cookieDomain

  return sessionSettings
}

module.exports = {
  ensureWelcomePage,
  hostConfigFor,
  initSessionHandler,
  printDebugInfo,
  sessionSettings
}
