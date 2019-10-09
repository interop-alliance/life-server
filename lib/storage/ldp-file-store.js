'use strict'

const { dirname } = require('path')
const fs = require('fs-extra')
const uuidv1 = require('uuid/v1')
const { resolve } = require('url')
const debug = require('../debug')
const { promisify } = require('util')
const rdf = require('rdflib')
const fetch = require('node-fetch')
const parseRdf = promisify(rdf.parse)
const serializeGraph = promisify(rdf.serialize)
const { extensions } = require('mime-types')
const http = require('http')
const https = require('https')
const HttpError = require('standard-http-error')

const { LdpStore } = require('./ldp-store')
const { LdpFileResource, LdpFileContainer } = require('./ldp-file-resource')
const LdpTarget = require('../api/ldp/ldp-target')

const { DEFAULT_RDF_TYPE, DEFAULT_ENCODING } = require('../constants')
const AVAILABLE_CHARSETS = ['utf8']

class LdpFileStore extends LdpStore {
  /**
   * @param options {object}
   *
   * @param options.fs {object} Expects the `fs-extra` API
   * @param options.mapper {LegacyResourceMapper}
   * @param options.host {SolidHost}
   */
  constructor (options) {
    super(options)
    this.fs = options.fs || fs
    this.mapper = options.mapper
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

    let exists
    let fsStats

    // Try and load file metadata
    try {
      fsStats = await this.fs.stat(path)
      exists = true
    } catch (error) {
      if (error.code === 'ENOENT' ||
          error.code === 'ENOTDIR') {
        exists = false
      } else {
        throw error
      }
    }

    const isContainer = fsStats ? fsStats.isDirectory() : target.url.endsWith('/')

    if (isContainer) {
      target.ensureTrailingSlash()
    }

    let encoding
    if (target.charset) {
      encoding = target.charset(AVAILABLE_CHARSETS)
    }

    const options = { target, path, contentType, encoding, exists, fsStats }

    const resource = isContainer
      ? new LdpFileContainer(options)
      : new LdpFileResource(options)

    return resource
  }

  /**
   * Creates a new Resource or Container instance. Used for creating new
   * resources rather than mapping to existing ones (hence no `fsStats` param).
   *
   * TODO: Make this sync (after making mapUrlToFile sync).
   *
   * @param target
   * @param [path]
   * @param [contentType]
   * @param [encoding] {string}
   * @param [isContainer] {boolean}
   *
   * @returns {LdpFileResource|LdpFileContainer}
   */
  async newResource ({ target, path, contentType, encoding, isContainer }) {
    contentType = contentType || target.bodyContentType

    if (!path) {
      const {
        path: mappedPath,
        contentType: mappedContentType
      } = await this.mapper.mapUrlToFile({ url: target.url })
      path = mappedPath
      contentType = contentType || mappedContentType
    }

    const options = { target, path, contentType, encoding }

    const resource = isContainer
      ? new LdpFileContainer(options)
      : new LdpFileResource(options)

    return resource
  }

  /**
   * Creates an LdpTarget instance for a POST request (which includes a `slug`
   * value, and is done against a container).
   * If the target resource exists, appends a UUID to the target name (so that
   * POSTs only create resources, and not overwrite).
   *
   * TODO: Currently this is bound to the File System. Need to decouple it and
   * move it to superclass, LdpStore.
   *
   * @param [slug] {string} Suggested name of file or container to be created
   * @param container {LdpFileContainer} Parent container (in which target is to
   *   be created)
   * @param headerMeta {Metadata} Result of parsing `Link:` header
   * @param bodyContentType {string} Mime type of incoming request body
   *
   * @returns {LdpTarget}
   */
  async targetFromSlug ({ slug = uuidv1(), container, headerMeta, bodyContentType }) {
    const mimeType = bodyContentType ? bodyContentType.replace(/\s*;.*/, '') : ''
    let extension = ''
    const isContainer = headerMeta.isContainer

    if (!isContainer) {
      extension = mimeType in extensions ? `.${extensions[mimeType][0]}` : ''
    }

    const filename = slug + extension

    let target = new LdpTarget({
      name: filename,
      url: resolve(container.target.url, filename),
      bodyContentType
    })

    if (isContainer) {
      target.ensureTrailingSlash()
    }

    if (await this.exists({ target })) {
      target = await this.targetFromSlug({
        slug: `${slug}-${uuidv1().split('-')[0]}`,
        container,
        headerMeta,
        bodyContentType
      })
    }

    return target
  }

  /**
   * Checks to see if a given target resource exists in the store.
   *
   * @param target {LdpTarget}
   *
   * @returns {Promise<boolean>}
   */
  async exists ({ target }) {
    const resource = await this.resource({ target })

    return this.fs.pathExists(resource.path)
  }

  /**
   * Creates a directory for a given container (if it doesn't exist already),
   * similar to a `mkdir -p` command.
   *
   * TODO: Consider having it return the container that was created (make sure
   *   its `exists` attribute is set.
   *
   * @param container
   * @returns {Promise<void>}
   */
  async createContainer ({ container }) {
    return this.fs.ensureDir(container.path)
  }

  /**
   * Creates the container (if it doesn't exist already),
   * similar to a `mkdir -p` command.
   *
   * @param container {LdpFileContainer}
   * @returns {Promise<void>}
   */
  async ensureContainer ({ container }) {
    return this.fs.ensureDir(container.path)
  }

  /**
   * Resolves with the resource when the write stream
   *   sends the `finish` event
   *
   * @param resource {LdpFileResource}
   * @param fromStream {ReadableStream} From incoming request, body stream
   *
   * @returns {Promise<WritableStream>}
   */
  async createResource ({ resource, fromStream }) {
    // TODO: Change this line to `ensureContainer` using resource.parent
    await this.fs.ensureDir(dirname(resource.path))

    const fileStream = this.createWriteStream({ resource })

    return new Promise((resolve, reject) => {
      const writeStream = fromStream.pipe(fileStream)

      writeStream.on('error', (error) => {
        reject(new Error(`Error creating a write stream: ${error}`))
      })
      writeStream.on('finish', () => {
        resolve(writeStream)
      })
    })
  }

  /**
   * Copies a resource from a remote url.
   *
   * @param copyFromUrl {string}
   * @param copyToResource {LdpFileResource}
   *
   * @returns {Promise<WriteStream>}
   */
  async copyResource ({ copyFromUrl, copyToResource }) {
    const copyToPath = copyToResource.path

    await this.fs.ensureDir(dirname(copyToPath))

    const request = /^https:/.test(copyFromUrl) ? https : http

    const fileStream = this.createWriteStream({ resource: copyToResource })

    return new Promise((resolve, reject) => {
      fileStream
        .on('error', error => {
          fileStream.destroy()
          this.fs.unlinkSync(copyToPath)
          return reject(new HttpError(400, 'Error writing data: ' + error))
        })
        .on('finish', function () {
          // Success
          debug.handlers('COPY -- Wrote data to: ' + copyToPath)
          resolve()
        })

      request.get(copyFromUrl)
        .on('error', (error) => {
          debug.handlers('COPY -- Error requesting source file: ' + error)
          fileStream.destroy()
          this.fs.unlinkSync(copyToPath)
          reject(new HttpError(400, `Error copying data: ${error}`))
        })
        .on('response', (response) => {
          // Got a response, but it was not successful
          if (response.statusCode !== 200) {
            debug.handlers('COPY -- error reading source file: ' +
              response.statusMessage)
            fileStream.destroy()
            this.fs.unlinkSync(copyToPath)
            return reject(new HttpError(response.statusCode,
              'Error reading source file: ' + response.statusMessage))
          }

          response.pipe(fileStream)
        })
    })
  }

  /**
   * Creates a ReadStream for a given resource. Use this instead of
   * `readBlob` whenever possible.
   *
   * @param resource {LdpFileResource}
   *
   * @returns {Promise<fs.ReadStream>}
   */
  async createReadStream ({ resource }) {
    const fileStream = this.fs.createReadStream(
      resource.path //, { encoding: resource.encoding }
    )

    return new Promise((resolve, reject) => {
      fileStream
        .on('error', error => {
          debug.handlers(`GET -- error reading ${resource.path}: ${error.message}`)
          reject(new Error(`Error creating a read stream: ${error}`))
        })
        .on('open', () => {
          debug.handlers(`GET -- Reading ${resource.path}`)
          resolve(fileStream)
        })
    })
  }

  /**
   * Creates a WriteStream for a given resource.
   *
   * @param resource {LdpFileResource}
   *
   * @return {fs.WriteStream}
   */
  createWriteStream ({ resource }) {
    return this.fs.createWriteStream(
      resource.path, { encoding: resource.encoding }
    )
  }

  /**
   * Loads the list of resources in a container (just the file names).
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
   * Gets the details on each resource in a container's resource list.
   * Important: Must only be used after `loadContentsList()` is called.
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
        return this.resource({ target: new LdpTarget({ name, url }) })
      })
    )
  }

  /**
   * Loads and parses the container's `.meta` resource.
   *
   * @param container {LdpFileContainer}
   *
   * @returns {Promise<IndexedFormula>} Resolves with the parsed `.meta` graph.
   */
  async readContainerMeta ({ container }) {
    let graph

    try {
      const metaTarget = new LdpTarget({ url: container.target.aclUrl })
      const metaResource = await this.resource({ target: metaTarget })
      graph = await this.loadParsedGraph({ resource: metaResource })
    } catch (error) {
      // do nothing, this is likely a 'not found' error
      graph = rdf.graph() // new/empty graph
    }

    return graph
  }

  /**
   * Deletes a given resource.
   *
   * @param resource {LdpFileResource}
   *
   * @returns {Promise}
   */
  async deleteResource ({ resource }) {
    return this.fs.remove(resource.path)
  }

  /**
   * Deletes a given container.
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

  /**
   * Loads the file contents from disk.
   * Warning: This is a buffering operation, so whenever possibly, prefer to
   * use `createReadStream()` instead.
   *
   * @param resource {LdpFileResource}
   * @param [encoding] {string|null}
   *
   * @throws {Error} `ENOENT` When file does not exist.
   * @throws {Error} When encountering a filesystem error that's not "File does
   *   not exist", such as `EACCES` etc.
   *
   * @returns {Promise<string|Buffer>}
   */
  async readBlob ({ resource, encoding = DEFAULT_ENCODING }) {
    if (!resource) {
      throw new Error('Cannot read null resource')
    }
    const { path } = resource
    return this.fs.readFile(path, encoding)
  }

  /**
   * Writes blob contents to a file on disk.
   * Warning: This is a buffering operation, so whenever possibly, prefer to
   * use `createWriteStream()` instead.
   *
   * @param resource {LdpFileResource}
   * @param blob {string|Buffer}
   *
   * @throws {Error}
   *
   * @returns {Promise<void>}
   */
  async writeBlob ({ resource, blob }) {
    if (!resource) {
      throw new Error('Cannot write blob to a null resource')
    }
    const { path } = resource
    await this.fs.ensureDir(dirname(path))
    return this.fs.writeFileSync(path, blob)
  }

  /**
   * Loads an RDF file from disk, parses it, and returns the resulting graph.
   *
   * @param [resource] {LdpResource}
   *
   * @param [graph] {IndexedFormula}
   * @param [contentType] {string}
   *
   * @throws {Error} File system errors (file does not exist, `EACCES` etc)
   * @throws {Error} Parse errors
   *
   * @returns {Promise<IndexedFormula>} Resolves with parsed graph
   */
  async loadParsedGraph ({ resource, graph = rdf.graph(),
                           contentType = DEFAULT_RDF_TYPE }) {
    const rawGraphContents = await this.readBlob({ resource })
    if (!rawGraphContents) {
      return graph
    }
    return parseRdf(rawGraphContents, graph, resource.target.url, contentType)
  }

  /**
   * Serializes and writes a graph to a given resource, and returns the original
   * (non-serialized) graph.
   *
   * @param resource {LdpFileResource}
   *
   * @param graph {IndexedFormula}
   * @param [contentType] {string}
   *
   * @return {Promise<IndexedFormula>}
   */
  async writeGraph ({ resource, graph, contentType = DEFAULT_RDF_TYPE }) {
    // target, kb, base, contentType
    const { url } = resource.target
    const graphRdf = await serializeGraph(graph.sym(url), graph, url, contentType)

    return this.writeBlob({ resource, blob: graphRdf })
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

    return parseRdf(body, graph, url, contentType)
  }

  /**
   * Attempts to fetch a graph first from the local store, and then via fetch,
   * and returns the parsed graph
   *
   * TODO: Only does local for now, not remote. Will use fetchRemoteGraph() in
   *   the future
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
