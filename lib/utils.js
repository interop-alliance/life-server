module.exports.uriToFilename = uriToFilename
module.exports.uriToRelativeFilename = uriToRelativeFilename
module.exports.filenameToBaseUri = filenameToBaseUri
module.exports.uriAbs = uriAbs
module.exports.pathBasename = pathBasename
module.exports.uriBase = uriBase
module.exports.hasSuffix = hasSuffix
module.exports.getResourceLink = getResourceLink
module.exports.parse = parse
module.exports.serialize = serialize
module.exports.translate = translate
module.exports.stringToStream = stringToStream
module.exports.reqToPath = reqToPath
module.exports.debrack = debrack
module.exports.stripLineEndings = stripLineEndings
module.exports.fullUrlForReq = fullUrlForReq

var fs = require('fs')
var path = require('path')
var S = require('string')
var $rdf = require('rdflib')
var from = require('from2')
var url = require('url')

function fullUrlForReq (req) {
  let fullUrl = url.format({
    protocol: req.protocol,
    host: req.get('host'),
    // pathname: req.originalUrl
    pathname: req.path,
    query: req.query
  })
  return fullUrl
}

function debrack (s) {
  if (s.length < 2) {
    return s
  }
  if (s[0] !== '<') {
    return s
  }
  if (s[s.length - 1] !== '>') {
    return s
  }
  return s.substring(1, s.length - 1)
}

function uriToFilename (uri, base) {
  var decoded = uri.split('/').map(decodeURIComponent).join('/')
  var filename = path.join(base, decoded)
  // Make sure filename ends with '/'  if filename exists and is a directory.
  // TODO this sync operation can be avoided and can be left
  // to do, to other components, see `ldp.get`
  try {
    var fileStats = fs.statSync(filename)
    if (fileStats.isDirectory() && !filename.endsWith('/')) {
      filename += '/'
    } else if (fileStats.isFile() && filename.endsWith('/')) {
      filename = S(filename).chompRight('/').s
    }
  } catch (err) {}
  return filename
}

function uriToRelativeFilename (uri, base) {
  var filename = uriToFilename(uri, base)
  var relative = path.relative(base, filename)
  return relative
}

function filenameToBaseUri (filename, uri, base) {
  var uriPath = S(filename).strip(base).toString()
  return uri + '/' + uriPath
}

function uriAbs (req) {
  return req.protocol + '://' + req.get('host')
}

function uriBase (req) {
  return uriAbs(req) + (req.baseUrl || '')
}

function pathBasename (fullpath) {
  var bname = ''
  if (fullpath) {
    bname = (fullpath.lastIndexOf('/') === fullpath.length - 1)
      ? ''
      : path.basename(fullpath)
  }
  return bname
}

function hasSuffix (path, suffixes) {
  for (var i in suffixes) {
    if (path.indexOf(suffixes[i], path.length - suffixes[i].length) !== -1) {
      return true
    }
  }
  return false
}

function getResourceLink (filename, uri, base, suffix, otherSuffix) {
  var link = filenameToBaseUri(filename, uri, base)
  if (link.endsWith(suffix)) {
    return link
  } else if (link.endsWith(otherSuffix)) {
    return S(link).chompRight(otherSuffix).s + suffix
  } else {
    return link + suffix
  }
}

function parse (data, baseUri, contentType, callback) {
  var graph = $rdf.graph()
  try {
    return $rdf.parse(data, graph, baseUri, contentType, callback)
  } catch (err) {
    return callback(err)
  }
}

function serialize (graph, baseUri, contentType, callback) {
  try {
                // target, kb, base, contentType, callback
    $rdf.serialize(null, graph, baseUri, contentType, function (err, result) {
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

  var data = ''
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

function stringToStream (string) {
  return from(function (size, next) {
    // if there's no more content
    // left in the string, close the stream.
    if (!string || string.length <= 0) {
      return next(null, null)
    }

    // Pull in a new chunk of text,
    // removing it from the string.
    var chunk = string.slice(0, size)
    string = string.slice(size)

    // Emit "chunk" from the stream.
    next(null, chunk)
  })
}

/**
 * Removes line endings from a given string. Used for WebID TLS Certificate
 * generation.
 *
 * @param obj {string}
 *
 * @return {string}
 */
function stripLineEndings (obj) {
  if (!obj) { return obj }

  return obj.replace(/(\r\n|\n|\r)/gm, '')
}

function reqToPath (req) {
  var ldp = req.app.locals.ldp
  var root = ldp.idp ? ldp.root + req.hostname + '/' : ldp.root
  return uriToFilename(req.path, root)
}
