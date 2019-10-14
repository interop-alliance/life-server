module.exports.translate = translate

const rdf = require('rdflib')

function parse (data, baseUri, contentType, callback) {
  const graph = rdf.graph()
  try {
    return rdf.parse(data, graph, baseUri, contentType, callback)
  } catch (err) {
    return callback(err)
  }
}

function serialize (graph, baseUri, contentType, callback) {
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

function translate (stream, baseUri, from, to, callback) {
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
      parse(data, baseUri, from, function (err, graph) {
        if (err) return callback(err)
        serialize(graph, baseUri, to, function (err, data) {
          if (err) return callback(err)
          callback(null, data)
        })
      })
    })
}
