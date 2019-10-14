module.exports.processHandlebarFile = processHandlebarFile

const fs = require('fs-extra')
const Handlebars = require('handlebars')
const debug = require('../debug').errors

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
    debug(`Error processing template: ${error}`)
    return source
  }
}
