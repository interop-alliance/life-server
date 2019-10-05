'use strict'

const { resolve } = require('url')
const { RDF_MIME_TYPES } = require('../../constants')

class LdpTarget {
  /**
   * @param url {string} Fully qualified url, with protocol etc
   * @param [name] {string} Filename part of the url (req.path)
   * @param [conneg] {Negotiator} Content type negotiator instance
   */
  constructor ({ url, name, conneg }) {
    this.url = url
    this.name = name || url
    this.isAcl = this.name.endsWith('.acl') // todo: pass in the .acl suffix
    this.isMeta = this.name.endsWith('.meta')
    this.conneg = conneg
  }

  /**
   * Ensures that the name and url are normalized as a container.
   */
  ensureTrailingSlash () {
    if (!this.url.endsWith('/')) {
      this.url += '/'
    }
    if (!this.name.endsWith('/')) {
      this.name += '/'
    }
  }

  get isContainer () {
    return this.url.endsWith('/')
  }

  get isRdf () {
    return this.rdfRequested
  }

  get rdfRequested () {
    return this.isContainer || this.isAcl || this.isMeta ||
      this.contentTypeRequested && this.contentTypeRequested(RDF_MIME_TYPES)
  }

  get isHtml () {
    return this.htmlRequested
  }

  /**
   * @returns {boolean}
   */
  get htmlRequested () {
    const requestedType = this.contentTypeRequested()
    return requestedType && requestedType.includes('text/html')
  }

  get isRoot () {
    return this.name === '/'
  }

  /**
   * @param charsets - Available charsets
   * @returns {*|undefined}
   */
  charset (charsets) {
    return (this.conneg && this.conneg.charset(charsets)) || undefined
  }

  /**
   * @param types - Available mime types
   * @returns {*|undefined}
   */
  contentTypeRequested (types) {
    return (this.conneg && this.conneg.mediaType(types)) || undefined
  }

  get parent () {
    if (this.isRoot) { return null }

    return this.isContainer ? resolve(this.url, '..') : resolve(this.url, '.')
  }
}

module.exports = LdpTarget
