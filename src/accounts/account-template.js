'use strict'

const { promisify } = require('util')
const recursiveRead = promisify(require('recursive-readdir'))
const path = require('path')
const mime = require('mime-types')
const { URL } = require('url')
const fs = require('fs-extra')
const { logger } = require('../logger')
const Handlebars = require('handlebars')
const { LdpTarget } = require('../storage/ldp-target')

const { RDF_MIME_TYPES } = require('../defaults')
const TEMPLATE_EXTENSIONS = ['.acl', '.meta', '.json', '.hbs', '.handlebars']
const TEMPLATE_FILES = ['web']

/**
 * Performs account container initialization from an account template
 * (see `./default-templates/new-account/`, for example).
 *
 * @class AccountTemplate
 */
class AccountTemplate {
  /**
   * @constructor
   * @param [options={}] {object}
   * @param options.accountStorage {LdpStore}
   * @param [options.substitutions={}] {object} Hashmap of key/value Handlebars
   *   template substitutions.
   * @param [options.rdfMimeTypes] {Array<string>} List of MIME types that are
   *   likely to contain RDF templates.
   * @param [options.templateExtensions] {Array<string>} List of extensions likely
   *   to contain templates.
   * @param [options.templateFiles] {Array<string>} List of reserved file names
   *   (such as the profile `web` doc) likely to contain templates.
   */
  constructor (options = {}) {
    this.accountStorage = options.accountStorage
    this.substitutions = options.substitutions || {}
    this.rdfMimeTypes = options.rdfMimeTypes || RDF_MIME_TYPES
    this.templateExtensions = options.templateExtensions || TEMPLATE_EXTENSIONS
    this.templateFiles = options.templateFiles || TEMPLATE_FILES
  }

  /**
   * Factory method, returns an AccountTemplate for a given user account.
   *
   * @param userAccount {UserAccount}
   * @param accountStorage {LdpStore}
   * @param host {SolidHost}
   * @param [options={}] {object}
   *
   * @return {AccountTemplate}
   */
  static for ({ userAccount, host, accountStorage }) {
    const { username, webId, name, email } = userAccount
    const { serverUri } = host
    const substitutions = {
      username, webId, name, email, serverUri
    }

    return new AccountTemplate({ substitutions, accountStorage })
  }

  /**
   * Creates a new account container by copying the account template to a new
   * destination. (Used for provisioning new user accounts.)
   *
   * @param templatePath {string}
   * @param accountPath {string}
   *
   * @return {Promise}
   */
  static async copyTemplateContainer ({ templatePath, accountPath }) {
    return fs.copy(templatePath, accountPath)
  }

  /**
   * Usage:
   * ```
   * provisionAccountFrom({
   *   templatePath: '/Users/alice/life-server/default-templates/',
   *   accountUrl: 'https://alice.com/'
   * })
   * ```
   * @param templatePath
   * @param accountUrl
   * @returns {Promise}
   */
  async provisionAccountFrom ({ templatePath, accountUrl }) {
    const { accountStorage } = this
    try {
      const accountTemplateFiles = await recursiveRead(templatePath)
      for (const filePath of accountTemplateFiles) {
        const relativePath = filePath.replace(templatePath, '') // FIXME: Use regex
        const target = new LdpTarget({ url: (new URL(relativePath, accountUrl)).toString() })
        const resource = await accountStorage.resource({ target })
        const contents = this.isTemplate(filePath)
          ? processHandlebarTemplate(fs.readFileSync(filePath, 'utf8'), this.substitutions)
          : fs.readFileSync(filePath)
        await accountStorage.writeBlob({ resource, blob: contents })
      }
    } catch (error) {
      logger.error(error)
      throw error
    }
  }

  /**
   * Tests whether a given file path is a template file (and so should be
   * processed by Handlebars).
   *
   * @param filePath {string}
   *
   * @return {boolean}
   */
  isTemplate (filePath) {
    const parsed = path.parse(filePath)

    const isRdf = this.rdfMimeTypes.includes(mime.lookup(filePath))
    const isTemplateExtension = this.templateExtensions.includes(parsed.ext)
    const isTemplateFile = this.templateFiles.includes(parsed.base) ||
        this.templateExtensions.includes(parsed.base) // the '/.acl' case

    return isRdf || isTemplateExtension || isTemplateFile
  }
}

async function processFile (filePath, manipulateSourceFn) {
  const rawSource = await fs.readFile(filePath, 'utf8')
  const output = manipulateSourceFn(rawSource)
  return fs.writeFile(filePath, output)
}

/**
 * Reads a file, processes it (performing template substitution), and saves
 * back the processed result.
 *
 * @param filePath {string}
 * @param substitutions {object}
 *
 * @return {Promise}
 */
async function processHandlebarFile (filePath, substitutions) {
  return processFile(filePath,
    (rawSource) => processHandlebarTemplate(rawSource, substitutions))
}

/**
 * Performs a Handlebars string template substitution, and returns the
 * resulting string.
 *
 * @see https://www.npmjs.com/package/handlebars
 *
 * @param source {string} e.g. 'Hello, {{name}}'
 * @param substitutions {object} Hashmap of substitution key/value pairs.
 *
 * @return {string} Result, e.g. 'Hello, Alice'
 */
function processHandlebarTemplate (source, substitutions) {
  try {
    const template = Handlebars.compile(source)
    return template(substitutions)
  } catch (error) {
    logger.error(`Error processing template: ${error}`)
    // return source
    throw error
  }
}

module.exports = {
  AccountTemplate,
  TEMPLATE_EXTENSIONS,
  TEMPLATE_FILES,
  processHandlebarFile
}
