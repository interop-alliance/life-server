'use strict'

const path = require('path')
const fs = require('fs-extra')
const { promisify } = require('util')
const rdf = require('rdflib')
const fetch = require('node-fetch')
const parse = promisify(rdf.parse)
// const debug = require('../../debug').ldp

const { LdpStore } = require('./ldp-store')
const { LdpFileResource, LdpFileContainer } = require('./ldp-file-resource')
const LdpTarget = require('../../api/ldp/ldp-target')

const { DEFAULT_RDF_TYPE } = require('../../constants')
const AVAILABLE_CHARSETS = ['utf8']

class LdpFileStore extends LdpStore {
  /**
   * @param options {object}
   *
   * @param options.fs {object} Expects the `fs-extra` API
   * @param options.mapper {LegacyResourceMapper}
   * @param options.host {SolidHost}
   *
   * @param options.suffixAcl {string}
   * @param options.suffixMeta {string}
   */
  constructor (options) {
    super(options)
    this.fs = options.fs || fs
    this.mapper = options.mapper
    this.host = options.host
  }

  /**
   * Creates an LdpFileResource from an LdpTarget, by mapping the target's
   * URL to a file path.
   *
   * @param target {LdpTarget}
   * @param target.url {string}
   *
   * @throws {Error} When encountering a filesystem error that's not "File does
   *   not exist", such as `EACCES` etc.
   *
   * @see https://nodejs.org/api/this.fs.html#fs_class_fs_stats
   *
   * @returns {Promise<LdpFileResource|LdpFileContainer>}
   */
  async resource ({ target }) {
    const {
      path,
      contentType
    } = await this.mapper.mapUrlToFile({ url: target.url })

    let exists = true
    let fsStats

    // Try and load file metadata
    try {
      fsStats = await this.fs.stat(path)
    } catch (error) {
      if (error.code === 'ENOENT') {
        exists = false
      } else {
        throw error
      }
    }

    const isContainer = fsStats ? fsStats.isDirectory() : target.url.endsWith('/')

    const encoding = target.charset(AVAILABLE_CHARSETS)

    const options = { target, path, contentType, encoding, exists, fsStats }

    const resource = isContainer
      ? new LdpFileContainer(options)
      : new LdpFileResource(options)
    // resource.normalizeUrl()

    return resource
  }

  /**
   * @param target {LdpTarget}
   *
   * @returns {Promise<boolean>}
   */
  async exists ({ target }) {
    const resource = await this.resource({ target })

    return this.fs.pathExists(resource.filePath)
  }

  async createContainer (container) {
    return this.fs.ensureDir(container.path)
  }

  async createResource (resource, bodyStream) {
    await this.fs.ensureDir(path.dirname(resource.path))

    return this.createWriteStream(resource, bodyStream)
  }

  /**
   * @param resource {LdpFileResource}
   * @param bodyStream {Stream}
   *
   * @throws {HttpError}
   *
   * @return {Promise<LdpFileResource>} Returns the resource when the write stream
   *   sends the `finish` event
   */
  async createWriteStream (resource, bodyStream) {
    return new Promise((resolve, reject) => {
      const fileStream = this.fs.createWriteStream(
        resource.path, { encoding: resource.encoding }
      )
      const writeStream = bodyStream.pipe(fileStream)

      writeStream.on('error', (error) => {
        reject(new Error(`Error creating a write stream: ${error}`))
      })
      writeStream.on('finish', () => {
        resolve(resource)
      })
    })
  }

  /**
   * Load the list of resources in a container (just the file names).
   *
   * Usage:
   * ```
   * container.resourceNames = await ldpStore.loadContentsList({ container })
   * ```
   *
   * @param container {LdpFileContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise<Array<string>>}
   */
  async loadContentsList ({ container }) {
    // todo: sort out encoding. Currently, conneg is returning '*' as encoding,
    // which results in an error from readdir
    return this.fs.readdir(container.path) //, container.encoding)
  }

  /**
   * Gets the details on each resource in a container's resource list
   *
   * @param container {LdpFileContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise<Array<LdpFileResource|LdpFileContainer>>}
   */
  async loadContentsDetails ({ container }) {
    return Promise.all(
      container.resourceUrls.map(resource => {
        const [ name, url ] = resource
        return this.resource({ target: new LdpTarget({name, url}) })
      })
    )
  }

  /**
   * @param resource
   *
   * @returns {Promise}
   */
  async deleteResource ({ resource }) {
    return this.fs.remove(resource.path)
  }

  /**
   * Note: Has `rm -rf` semantics, so you need to enforce proper "don't delete
   * if not empty" semantics in the calling code.
   *
   * @throws {Error}
   *
   * @param container
   *
   * @returns {Promise}
   */
  async deleteContainer ({ container }) {
    return this.fs.remove(container.path)
  }

  async readBlob ({ resource }) {
    if (!resource || !resource.path) {
      throw new Error('Cannot read undefined resource path: ' + resource)
    }
    return this.fs.readFile(resource.path, 'utf8')
  }

  /**
   * @param resource {LdpResource}
   * @param [graph] {IndexedFormula}
   * @param [contentType] {string}
   *
   * @returns {Promise<IndexedFormula>}
   */
  async loadParsedGraph ({ resource, graph = rdf.graph(), contentType = DEFAULT_RDF_TYPE }) {
    const rawGraph = await this.readBlob({ resource })
    return parse(rawGraph, graph, resource.target.url, contentType)
  }

  async fetchRemoteGraph ({ url, graph = rdf.graph(), contentType }) {
    const response = await fetch(url)
    if (!response.ok) {
      const error = new Error(
        `Error fetching ${url}: ${response.status} ${response.statusText}`
      )
      error.statusCode = response.status || 400
      throw error
    }
    const body = await response.text()

    return parse(body, graph, url, contentType)
  }

  /**
   * Attempts to fetch a graph first from the local store, and then via fetch,
   * and returns the parsed graph
   *
   * TODO: Only does local for now, not remote
   *
   * @param [url] {string}
   * @param [resource] {LdpResource}
   * @param graph {IndexedFormula}
   * @param contentType {string}
   * @returns {Promise<IndexedFormula>}
   */
  async fetchGraph ({ url, resource, graph, contentType = DEFAULT_RDF_TYPE }) {
    if (!resource) {
      const target = new LdpTarget({ url })
      resource = await this.resource({ target })
    }

    return this.loadParsedGraph({ resource, graph, contentType })
  }
}

module.exports = {
  LdpStore,
  LdpFileStore
}
