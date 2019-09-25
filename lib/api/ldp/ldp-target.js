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
    this.conneg = conneg
  }

  get isContainer () {
    return this.url.endsWith('/')
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
  mediaType (types) {
    return (this.conneg && this.conneg.mediaType(types)) || undefined
  }

  get isGraph () {
    return this.mediaType(RDF_MIME_TYPES)
  }

  get isRoot () {
    return this.name === '/'
  }

  get parent () {
    if (this.isRoot) { return null }

    return this.isContainer ? resolve(this.url, '..') : resolve(this.url, '.')
  }
}

module.exports = LdpTarget
