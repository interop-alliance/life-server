'use strict'

const { URL } = require('url')
const { RDF_MIME_TYPES, ACL_SUFFIX, META_SUFFIX } = require('../defaults')

class LdpTarget {
  /**
   * @param url {string} Fully qualified url, with protocol etc
   * @param [name] {string} Filename part of the url (req.path)
   * @param [bodyContentType] {string} Request's `content-type:` header
   * @param [conneg] {Negotiator} Content type negotiator instance
   */
  constructor ({ url, name, bodyContentType, conneg }) {
    this.url = url
    this.name = name || url
    this.bodyContentType = bodyContentType
    this.isAcl = this.name.endsWith(ACL_SUFFIX)
    this.isMeta = this.name.endsWith(META_SUFFIX)
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

  get aclUrl () {
    return this.isAcl ? this.url : (new URL(ACL_SUFFIX, this.url)).toString()
  }

  get metaUrl () {
    return this.isMeta ? this.url : (new URL(META_SUFFIX, this.url)).toString()
  }

  get isContainer () {
    return this.url.endsWith('/')
  }

  get isRdf () {
    return this.rdfRequested
  }

  get rdfRequested () {
    return this.isContainer || this.isAcl || this.isMeta ||
      (this.contentTypeRequested && this.contentTypeRequested(RDF_MIME_TYPES))
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

    return this.isContainer
      ? (new URL('..', this.url)).toString()
      : (new URL('.', this.url)).toString()
  }
}

module.exports = {
  LdpTarget
}
