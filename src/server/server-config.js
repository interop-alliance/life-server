'use strict'
/**
 * Server config initialization utilities
 */

const fs = require('fs-extra')
const path = require('path')
const { v1: uuidv1 } = require('uuid')
const session = require('express-session')
const MemoryStore = require('memorystore')(session)

const { AccountTemplate, processHandlebarFile } = require('../accounts/account-template')
const { logger } = require('../logger')

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

/**
 * Creates (copies from the server templates dir) a Welcome index page for the
 * server root web directory, if one does not already exist. This page
 * typically has links to account signup and login, and can be overridden by
 * the server operator.
 *
 * @param argv {object} App config object
 */
async function ensureWelcomePage ({
                                    root, multiuser, templates, server, host, storage
                                  }) {
  const serverTemplate = path.join(__dirname, '..', 'templates', 'server')
  const rootDir = path.resolve(root)
  const serverRootDir = multiuser ? path.join(rootDir, host.hostname) : rootDir
  logger.info(`Checking for server welcome page, root dir: '${serverRootDir}'`)
  const existingIndexPage = path.join(serverRootDir, 'index.html')
  const packageData = require('../../package.json')

  if (!fs.existsSync(existingIndexPage)) {
    logger.info('Creating server root dir.')
    await fs.mkdirp(serverRootDir)
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

function initSessionHandler ({ app, useSecureCookies, host, secret = uuidv1() }) {
  const sessionSettings = {
    secret,
    store: new MemoryStore({
      checkPeriod: 24 * 60 * 60 * 1000 // prune/expire entries every 24h (in ms)
    }),
    saveUninitialized: false,
    resave: false,
    rolling: true,
    cookie: {
      maxAge: 14 * 24 * 60 * 60 * 1000, // 2 weeks in milliseconds
      domain: host.cookieDomain,
      secure: useSecureCookies // true if https is on
    }
  }

  // Store the user's session key in a cookie
  // (for same-domain browsing by people only)
  const sessionHandler = session(sessionSettings)

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

module.exports = {
  ensureWelcomePage,
  initSessionHandler,
  printDebugInfo
}