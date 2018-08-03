'use strict'

class LdpTarget {
  /**
   * @param url {string}
   * @param [name] {string} Filename part of the url
   * @param [conneg] {Negotiator} Content type negotiator instance
   */
  constructor ({url, name, conneg}) {
    this.url = url
    this.name = name
    this.conneg = conneg
  }

  get isContainer () {
    return this.url.endsWith('/')
  }

  charset () {
    return (this.conneg && this.conneg.charset()) || undefined
  }

  mediaType () {
    return (this.conneg && this.conneg.mediaType()) || undefined
  }
}

module.exports = LdpTarget
