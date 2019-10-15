'use strict'

const { promisify } = require('util')
const recursiveRead = promisify(require('recursive-readdir'))
const path = require('path')
const mime = require('mime-types')
const fs = require('fs-extra')
const { logger } = require('../logger')
const Handlebars = require('handlebars')

const { RDF_MIME_TYPES } = require('../defaults')
const TEMPLATE_EXTENSIONS = [ '.acl', '.meta', '.json', '.hbs', '.handlebars' ]
const TEMPLATE_FILES = [ 'card' ]

/**
 * Performs account folder initialization from an account template
 * (see `./default-templates/new-account/`, for example).
 *
 * @class AccountTemplate
 */
class AccountTemplate {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.substitutions={}] {Object} Hashmap of key/value Handlebars
   *   template substitutions.
   * @param [options.rdfMimeTypes] {Array<string>} List of MIME types that are
   *   likely to contain RDF templates.
   * @param [options.templateExtensions] {Array<string>} List of extensions likely
   *   to contain templates.
   * @param [options.templateFiles] {Array<string>} List of reserved file names
   *   (such as the profile `card`) likely to contain templates.
   */
  constructor (options = {}) {
    this.substitutions = options.substitutions || {}
    this.rdfMimeTypes = options.rdfMimeTypes || RDF_MIME_TYPES
    this.templateExtensions = options.templateExtensions || TEMPLATE_EXTENSIONS
    this.templateFiles = options.templateFiles || TEMPLATE_FILES
  }

  /**
   * Factory method, returns an AccountTemplate for a given user account.
   *
   * @param userAccount {UserAccount}
   * @param [options={}] {Object}
   *
   * @return {AccountTemplate}
   */
  static for (userAccount, options = {}) {
    let substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)

    options = Object.assign({ substitutions }, options)

    return new AccountTemplate(options)
  }

  /**
   * Creates a new account directory by copying the account template to a new
   * destination (the account dir path).
   *
   * @param templatePath {string}
   * @param accountPath {string}
   *
   * @return {Promise}
   */
  static async copyTemplateDir (templatePath, accountPath) {
    return fs.copy(templatePath, accountPath)
  }

  /**
   * Returns a template substitutions key/value object for a given user account.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Object}
   */
  static templateSubstitutionsFor (userAccount) {
    return {
      name: userAccount.displayName,
      webId: userAccount.webId,
      email: userAccount.email
    }
  }

  /**
   * Returns a list of all of the files in an account dir that are likely to
   * contain Handlebars templates (and which need to be processed).
   *
   * @param accountPath {string}
   *
   * @return {Promise<Array<string>>}
   */
  async readTemplateFiles (accountPath) {
    const files = await recursiveRead(accountPath)
    return files.filter(file => this.isTemplate(file))
  }

  /**
   * Reads and processes each file in a user account that is likely to contain
   * Handlebars templates. Performs template substitutions on each one.
   *
   * @param accountPath {string}
   *
   * @return {Promise}
   */
  async processAccount (accountPath) {
    const files = await this.readTemplateFiles(accountPath)
    return Promise.all(
      files.map(path => processHandlebarFile(path, this.substitutions))
    )
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
    let parsed = path.parse(filePath)

    let isRdf = this.rdfMimeTypes.includes(mime.lookup(filePath))
    let isTemplateExtension = this.templateExtensions.includes(parsed.ext)
    let isTemplateFile = this.templateFiles.includes(parsed.base) ||
        this.templateExtensions.includes(parsed.base)  // the '/.acl' case

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
 * @param substitutions {Object}
 *
 * @return {Promise}
 */
async function processHandlebarFile (filePath, substitutions) {
  return processFile(filePath, (rawSource) => processHandlebarTemplate(rawSource, substitutions))
}

/**
 * Performs a Handlebars string template substitution, and returns the
 * resulting string.
 *
 * @see https://www.npmjs.com/package/handlebars
 *
 * @param source {string} e.g. 'Hello, {{name}}'
 *
 * @return {string} Result, e.g. 'Hello, Alice'
 */
function processHandlebarTemplate (source, substitutions) {
  try {
    const template = Handlebars.compile(source)
    return template(substitutions)
  } catch (error) {
    logger.error(`Error processing template: ${error}`)
    return source
  }
}

module.exports = {
  AccountTemplate,
  TEMPLATE_EXTENSIONS,
  TEMPLATE_FILES,
  processHandlebarFile
}
