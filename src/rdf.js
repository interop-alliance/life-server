const rdf = require('rdflib')
const { promisify } = require('util')
const parseRdf = promisify(rdf.parse)
const fetch = require('node-fetch')

function _parse (data, baseUri, contentType, callback) {
  const graph = rdf.graph()
  try {
    return rdf.parse(data, graph, baseUri, contentType, callback)
  } catch (err) {
    return callback(err)
  }
}

function _serialize (graph, baseUri, contentType, callback) {
  try {
    // target, kb, base, contentType, callback
    rdf.serialize(null, graph, baseUri, contentType, function (err, result) {
      if (err) {
        console.log(err)
        return callback(err)
      }
      if (result === undefined) {
        return callback(new Error('Error serializing the graph to ' +
          contentType))
      }

      return callback(null, result)
    })
  } catch (err) {
    console.log(err)
    callback(err)
  }
}

function translateRdfStream (stream, baseUri, from, to, callback) {
  // Handle Turtle Accept header
  if (to === 'text/turtle' ||
      to === 'text/n3' ||
      to === 'application/turtle' ||
      to === 'application/n3') {
    to = 'text/turtle'
  }

  let data = ''
  stream
    .on('data', function (chunk) {
      data += chunk
    })
    .on('end', function () {
      _parse(data, baseUri, from, function (err, graph) {
        if (err) return callback(err)
        _serialize(graph, baseUri, to, function (err, data) {
          if (err) return callback(err)
          callback(null, data)
        })
      })
    })
}

/**
 * Fetches a remote RDF resource, parses it and returns the resulting graph.
 *
 * (Not used at the moment; is supposed to be used to fetch non-local group
 * listings, for use with group ACLs.)
 * @see https://github.com/solid/web-access-control-spec#groups-of-agents
 *
 * @param url
 * @param graph
 * @param contentType
 * @returns {Promise<*>}
 */
async function fetchRemoteGraph ({ url, graph = rdf.graph(), contentType }) {
  const response = await fetch(url)
  if (!response.ok) {
    const error = new Error(
      `Error fetching ${url}: ${response.status} ${response.statusText}`
    )
    error.statusCode = response.status || 400
    throw error
  }
  const body = await response.text()

  return parseRdf(body, graph, url, contentType)
}

module.exports = {
  translateRdfStream,
  fetchRemoteGraph
}
