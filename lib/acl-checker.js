'use strict'

const PermissionSet = require('solid-permissions').PermissionSet
const rdf = require('rdflib')
const debug = require('./debug').ACL
const HTTPError = require('./http-error')

const { ACL_SUFFIX } = require('./constants')

// An ACLChecker exposes the permissions on a specific resource
class ACLChecker {
  constructor (resource, options = {}) {
    this.resource = resource
    this.host = options.host
    this.origin = options.origin
    this.fetch = options.fetch
    this.fetchGraph = options.fetchGraph
    this.strictOrigin = options.strictOrigin
    this.suffix = options.suffix || ACL_SUFFIX
  }

  static from ({ resourceUri, req }) {
    const { mapper, ldp } = req.app.locals

    return new ACLChecker(resourceUri, {
      origin: req.get('origin'),
      host: req.protocol + '://' + req.get('host'),
      fetch: ACLChecker.fetchFromLdp(mapper, ldp),
      fetchGraph: (uri, options) => {
        // first try loading from local fs
        return ldp.getGraph(uri, options.contentType)
        // failing that, fetch remote graph
          .catch(() => ldp.fetchGraph(uri, options))
      },
      suffix: ldp.suffixAcl,
      strictOrigin: ldp.strictOrigin
    })
  }

  /**
   * Returns a fetch document handler used by the ACLChecker to fetch .acl
   * resources up the inheritance chain.
   * The `fetch(uri, callback)` results in the callback, with either:
   *   - `callback(err, graph)` if any error is encountered, or
   *   - `callback(null, graph)` with the parsed RDF graph of the fetched resource
   * @return {Function} Returns a `fetch(uri, callback)` handler
   */
  static fetchFromLdp (mapper, ldp) {
    return function fetch (url, callback) {
      // Convert the URL into a filename
      mapper.mapUrlToFile({ url })
      // Read the file from disk
        .then(({ path }) => new Promise((resolve, reject) => {
          ldp.readFile(path, (e, c) => e ? reject(e) : resolve(c))
        }))
        // Parse the file as Turtle
        .then(body => {
          // console.log(url, body)
          const graph = rdf.graph()
          rdf.parse(body, graph, url, 'text/turtle')
          return graph
        })
        // Return the ACL graph
        .then(graph => callback(null, graph), callback)
    }
  }

  // Returns a fulfilled promise when the user can access the resource
  // in the given mode, or rejects with an HTTP error otherwise
  can (user, mode) {
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
    }

    // Obtain the permission set for the resource
    if (!this._permissionSet) {
      this._permissionSet = this.getNearestACL()
        .then(acl => this.getPermissionSet(acl))
    }

    // Check the resource's permissions
    return this._permissionSet
      .then(acls => this.checkAccess(acls, user, mode))
      .catch(() => {
        if (!user) {
          throw new HTTPError(401, `Access to ${this.resource} requires authorization`)
        } else {
          throw new HTTPError(403, `Access to ${this.resource} denied for ${user}`)
        }
      })
  }

  /**
   * Gets the ACL that applies to the resource
   *
   * @returns {Promise<{acl: string, graph: IndexedFormula, isContainer: boolean}>}
   */
  async getNearestACL () {
    const { resource } = this
    let isContainer = false
    // Create a cascade of reject handlers (one for each possible ACL)
    const nearestACL = this.getPossibleACLs().reduce((prevACL, acl) => {
      return prevACL.catch(() => new Promise((resolve, reject) => {
        this.fetch(acl, (err, graph) => {
          if (err || !graph || !graph.length) {
            isContainer = true
            reject(err)
          } else {
            const relative = resource.replace(acl.replace(/[^/]+$/, ''), './')
            debug(`Using ACL ${acl} for ${relative}`)
            resolve({ acl, graph, isContainer })
          }
        })
      }))
    }, Promise.reject())
    return nearestACL.catch(e => { throw new Error('No ACL resource found') })
  }

  // Gets all possible ACL paths that apply to the resource
  getPossibleACLs () {
    // Obtain the resource URI and the length of its base
    let { resource: uri, suffix } = this
    if (!uri) {
      throw new Error('No possible ACL matches found - missing uri')
    }

    const matches = uri.match(/^[^:]+:\/*[^/]+/)

    if (!matches) {
      throw new Error('No possible ACL matches found for uri: ' + uri)
    }

    const [ { length: base } ] = matches

    // If the URI points to a file, append the file's ACL
    const possibleAcls = []
    if (!uri.endsWith('/')) {
      possibleAcls.push(uri.endsWith(suffix) ? uri : uri + suffix)
    }

    // Append the ACLs of all parent directories
    for (let i = lastSlash(uri); i >= base; i = lastSlash(uri, i - 1)) {
      possibleAcls.push(uri.substr(0, i + 1) + suffix)
    }
    return possibleAcls
  }

  // Tests whether the permissions allow a given operation
  checkAccess (permissionSet, user, mode) {
    const options = { fetchGraph: this.fetchGraph }
    return permissionSet.checkAccess(this.resource, user, mode, options)
      .then(hasAccess => {
        if (hasAccess) {
          return true
        } else {
          throw new Error('ACL file found but no matching policy found')
        }
      })
  }

  // Gets the permission set for the given ACL
  getPermissionSet ({ acl, graph, isContainer }) {
    if (!graph || graph.length === 0) {
      debug('ACL ' + acl + ' is empty')
      throw new Error('No policy found - empty ACL')
    }
    const aclOptions = {
      aclSuffix: this.suffix,
      graph: graph,
      host: this.host,
      origin: this.origin,
      rdf: rdf,
      strictOrigin: this.strictOrigin,
      isAcl: uri => this.isAcl(uri),
      aclUrlFor: uri => this.aclUrlFor(uri)
    }
    return new PermissionSet(this.resource, acl, isContainer, aclOptions)
  }

  aclUrlFor (uri) {
    return this.isAcl(uri) ? uri : uri + this.suffix
  }

  isAcl (resource) {
    return resource.endsWith(this.suffix)
  }
}

// Returns the index of the last slash before the given position
function lastSlash (string, pos = string.length) {
  return string.lastIndexOf('/', pos)
}

module.exports = ACLChecker
