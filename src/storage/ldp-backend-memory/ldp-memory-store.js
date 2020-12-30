'use strict'

const { v1: uuidv1 } = require('uuid')
// const { URL } = require('url')
// const { logger } = require('../../logger')
// const http = require('http')
// const https = require('https')
// const HttpError = require('standard-http-error')

const { LdpStore } = require('../ldp-store')
const { LdpTarget } = require('../ldp-target')
const { LdpResource, LdpContainer, LdpServerMeta } = require('../ldp-resource')

const { DEFAULT_ENCODING } = require('../../defaults')
const AVAILABLE_CHARSETS = ['utf8']

class LdpMemoryStore extends LdpStore {
  /**
   * @param options.root {LdpContainer} Root container
   *
   * Inherited from superclass:
   * @param options.host {Agent}
   */
  constructor (options) {
    super(options)

    this.map = new Map()
    this.initRootContainer()
  }

  initRootContainer () {
    const serverMeta = new LdpServerMeta()
    const rootContainer = new LdpContainer({
      target: new LdpTarget({ url: '/' }),
      parent: null,
      exists: true,
      serverMeta
    })
    this.map.set('/', rootContainer)
  }

  /**
   * Creates an LdpResource from an LdpTarget, by mapping the target's
   * URL to a file path.
   *
   * @param target {LdpTarget}
   * @param target.url {string}
   *
   * @returns {Promise<LdpResource|LdpContainer>}
   */
  async resource ({ target }) {
    const exists = await this.exists({ target })
    const isContainer = target.url.endsWith('/')

    let encoding
    if (target.charset) {
      encoding = target.charset(AVAILABLE_CHARSETS)
    }

    const options = {
      target,
      // contentType,  @FIXME
      encoding,
      exists,
      serverMeta: new LdpServerMeta()
    }

    const resource = isContainer
      ? new LdpContainer(options)
      : new LdpResource(options)

    return resource
  }

  /**
   * Creates a new Resource or Container instance. Used for creating new
   * resources rather than mapping to existing ones.
   *
   * Used in multi-file upload on POST.
   *
   * @param target
   * @param [contentType]
   * @param [encoding] {string}
   *
   * @returns {LdpResource}
   */
  addResource ({ target, contentType, encoding }) {
    contentType = contentType || target.bodyContentType

    const serverMeta = new LdpServerMeta({ contentType })

    return new LdpResource({ target, encoding, serverMeta })
  }

  /**
   * Creates an LdpTarget instance for a POST request (which includes a `slug`
   * value, and is done against a container).
   * If the target resource exists, appends a UUID to the target name (so that
   * POSTs only create resources, and not overwrite).
   *
   * @param [slug] {string} Suggested name of file or container to be created
   * @param container {LdpContainer} Parent container (in which target is to
   *   be created)
   * @param headerMeta {Metadata} Result of parsing `Link:` header
   * @param bodyContentType {string} Mime type of incoming request body
   *
   * @returns {LdpTarget}
   */
  async targetFromSlug ({ slug = uuidv1(), container, headerMeta, bodyContentType }) {
    // const mimeType = bodyContentType ? bodyContentType.replace(/\s*;.*/, '') : ''
    // let extension = ''
    // const isContainer = headerMeta.isContainer
    //
    // if (!isContainer) {
    //   extension = mimeType in extensions ? `.${extensions[mimeType][0]}` : ''
    // }
    //
    // const filename = slug + extension
    //
    // let target = new LdpTarget({
    //   name: filename,
    //   url: (new URL(filename, container.target.url)).toString(),
    //   bodyContentType
    // })
    //
    // if (isContainer) {
    //   target.ensureTrailingSlash()
    // }
    //
    // if (await this.exists({ target })) {
    //   target = await this.targetFromSlug({
    //     slug: `${slug}-${uuidv1().split('-')[0]}`,
    //     container,
    //     headerMeta,
    //     bodyContentType
    //   })
    // }
    //
    // return target
  }

  /**
   * Checks to see if a given target resource exists in the store.
   *
   * @param target {LdpTarget}
   *
   * @returns {Promise<boolean>}
   */
  async exists ({ target }) {
    return this.map.has(target.url)
  }

  /**
   * Creates the container (if it doesn't exist already),
   * similar to a `mkdir -p` command.
   *
   * @param container {LdpContainer}
   * @returns {Promise<void>}
   */
  async ensureContainer ({ container }) {
    if (!this.map.has(container.target.url)) {
      this.map.set(container.target.url, container)
    }
  }

  /**
   * Resolves with the resource when the write stream
   *   sends the `finish` event
   *
   * @param resource {LdpResource}
   * @param fromStream {ReadableStream} From incoming request, body stream
   *
   * @returns {Promise<WritableStream>}
   */
  async writeResourceStream ({ resource, fromStream }) {
    // TODO: Change this line to `ensureContainer` using resource.parent
    // await this.fs.ensureDir(dirname(resource.path))
    //
    // const fileStream = this.createWriteStream({ resource })
    //
    // return new Promise((resolve, reject) => {
    //   const writeStream = fromStream.pipe(fileStream)
    //
    //   writeStream.on('error', (error) => {
    //     reject(new Error(`Error creating a write stream: ${error}`))
    //   })
    //   writeStream.on('finish', () => {
    //     resolve(writeStream)
    //   })
    // })
  }

  /**
   * Copies a resource from a remote url.
   *
   * @param copyFromUrl {string}
   * @param copyToResource {LdpResource}
   *
   * @returns {Promise<WriteStream>}
   */
  async copyResource ({ copyFromUrl, copyToResource }) {
    // const copyToPath = copyToResource.path
    //
    // await this.fs.ensureDir(dirname(copyToPath))
    //
    // const request = /^https:/.test(copyFromUrl) ? https : http
    //
    // const fileStream = this.createWriteStream({ resource: copyToResource })
    //
    // return new Promise((resolve, reject) => {
    //   fileStream
    //     .on('error', error => {
    //       fileStream.destroy()
    //       this.fs.unlinkSync(copyToPath)
    //       return reject(new HttpError(400, 'Error writing data: ' + error))
    //     })
    //     .on('finish', function () {
    //       // Success
    //       logger.info('COPY -- Wrote data to: ' + copyToPath)
    //       resolve()
    //     })
    //
    //   request.get(copyFromUrl)
    //     .on('error', (error) => {
    //       logger.warn('COPY -- Error requesting source file: ' + error)
    //       fileStream.destroy()
    //       this.fs.unlinkSync(copyToPath)
    //       reject(new HttpError(400, `Error copying data: ${error}`))
    //     })
    //     .on('response', (response) => {
    //       // Got a response, but it was not successful
    //       if (response.statusCode !== 200) {
    //         logger.warn('COPY -- error reading source file: ' +
    //           response.statusMessage)
    //         fileStream.destroy()
    //         this.fs.unlinkSync(copyToPath)
    //         return reject(new HttpError(response.statusCode,
    //           'Error reading source file: ' + response.statusMessage))
    //       }
    //
    //       response.pipe(fileStream)
    //     })
    // })
  }

  /**
   * Creates a ReadStream for a given resource. Use this instead of
   * `readBlob` whenever possible.
   *
   * @param resource {LdpResource}
   *
   * @returns {Promise<fs.ReadStream>}
   */
  async createReadStream ({ resource }) {
    // const fileStream = this.fs.createReadStream(
    //   resource.path //, { encoding: resource.encoding }
    // )
    //
    // return new Promise((resolve, reject) => {
    //   fileStream
    //     .on('error', error => {
    //       logger.warn(`GET -- error reading ${resource.path}: ${error.message}`)
    //       reject(new Error(`Error creating a read stream: ${error}`))
    //     })
    //     .on('open', () => {
    //       logger.info(`GET -- Reading ${resource.path}`)
    //       resolve(fileStream)
    //     })
    // })
  }

  /**
   * Creates a WriteStream for a given resource.
   *
   * @param resource {LdpResource}
   *
   * @return {fs.WriteStream}
   */
  createWriteStream ({ resource }) {
    // return this.fs.createWriteStream(
    //   resource.path, { encoding: resource.encoding }
    // )
  }

  /**
   * Loads the list of resources in a container (just the resource names).
   *
   * Usage:
   * ```
   * container.resourceNames = await ldpStore.loadContentsList({ container })
   * ```
   *
   * See also `LdpStore.loadContentsDetails()`
   *
   * @param container {LdpContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise<Array<string>>}
   */
  async loadContentsList ({ container }) {
    // todo: sort out encoding. Currently, conneg is returning '*' as encoding,
    // which results in an error from readdir
    // return this.fs.readdir(container.path) //, container.encoding)
  }

  /**
   * Deletes a given resource.
   *
   * @param resource {LdpResource}
   *
   * @returns {Promise}
   */
  async deleteResource ({ resource }) {
    // return this.fs.remove(resource.path)
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
    // return this.fs.remove(container.path)
  }

  /**
   * Loads the file contents from disk.
   * Warning: This is a buffering operation, so whenever possibly, prefer to
   * use `createReadStream()` instead.
   *
   * @param resource {LdpResource}
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
    // const { path } = resource
    // return this.fs.readFile(path, encoding)
  }

  /**
   * Writes blob contents to a file on disk.
   * Warning: This is a buffering operation, so whenever possibly, prefer to
   * use `createWriteStream()` instead.
   *
   * @param resource {LdpResource}
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
    // const { path } = resource
    // await this.fs.ensureDir(dirname(path))
    // return this.fs.writeFileSync(path, blob)
  }
}

module.exports = {
  LdpMemoryStore
}
