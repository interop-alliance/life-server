'use strict'

/**
 * Server config initialization utilities
 */

const fs = require('fs-extra')
const path = require('path')
const uuid = require('uuid')
const session = require('express-session')
const { AccountTemplate, processHandlebarFile } = require('./account-mgmt/account-template')
const LegacyResourceMapper = require('./data-storage/ldp-backend-fs/legacy-resource-mapper')
const { StorageManager } = require('./storage-manager')
const { LdpFileStore } = require('./data-storage/ldp-backend-fs/ldp-file-store')
const { CollectionManager } = require('./data-storage/collection-manager')
const couchClient = require('nano')
const { URL } = require('url')
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
 * @param host {SolidHost}
 * @param couchConfig {object} CouchDB config hashmap from argv
 *
 * @returns {StorageManager}
 */
function initStorage ({ host, couchConfig }) {
  const mapper = LegacyResourceMapper.from({ host })
  const ldpStore = new LdpFileStore({ host, mapper })

  return new StorageManager({
    host,
    ldpStore,
    accountStore: ldpStore,
    collectionManager: initCollectionManager({ couchConfig })
  })
}

/**
 * @param couchConfig {object} CouchDB config hashmap from argv
 *
 * @returns {CollectionManager}
 */
function initCollectionManager ({ couchConfig }) {
  if (!couchConfig) { return }

  const couchUrl = new URL(couchConfig.url)
  couchUrl.username = couchConfig.username
  couchUrl.password = couchConfig.password
  const couch = couchClient(couchUrl.toString())

  return new CollectionManager({ couch })
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
      // Otherwise, when a user is logged in to their Solid server,
      // any third-party application could perform authenticated requests
      // without permission by including the credentials set by the Solid server.
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
 * @param host {SolidHost}
 *
 * @return {Object} `express-session` settings object
 */
function sessionSettings (secureCookies, host) {
  const sessionSettings = {
    secret: uuid.v1(),
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
  initStorage,
  printDebugInfo,
  sessionSettings
}
