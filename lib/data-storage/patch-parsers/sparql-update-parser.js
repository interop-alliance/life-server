// Parses an application/sparql-update patch

module.exports = parsePatchDocument

const $rdf = require('rdflib')
const HttpError = require('standard-http-error')

// Parses the given SPARQL UPDATE document
async function parsePatchDocument (targetURI, patchURI, patchText) {
  const baseURI = patchURI.replace(/#.*/, '')
  try {
    return $rdf.sparqlUpdateParser(patchText, $rdf.graph(), baseURI)
  } catch (err) {
    throw new HttpError(400, `Patch document syntax error: ${err}`)
  }
}
