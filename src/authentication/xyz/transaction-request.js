'use strict'

const HttpError = require('standard-http-error')
const cryptoRandomString = require('crypto-random-string')
// const { URL, URLSearchParams } = require('url')
// const { logger } = require('../../logger')
const { ApiRequest } = require('../../api-request')

function newHandle () {
  return cryptoRandomString({ length: 20, type: 'base64' })
}

class AuthTransaction {
  constructor ({ keys, resources, clientDisplay, interact, user, capabilities, handles } = {}) {
    this.key = keys
    this.resources = resources
    this.clientDisplay = clientDisplay
    this.interact = interact
    this.user = user
    this.capabilities = capabilities

    this.handles = handles || { tx: newHandle() }
  }

  get handle () {
    return this.handles.tx
  }

  toJSON () {
    const tx = { handle: this.handles.tx }

    if (this.handles.key) {
      tx.key_handle = this.handles.key
    }
    if (this.handles.resource) {
      tx.resource_handle = this.handles.resource
    }
    if (this.handles.clientDisplay) {
      tx.client_display_handle = this.handles.clientDisplay
    }
    if (this.handles.user) {
      tx.user_handle = this.handles.user
    }
    if (this.capabilities) {
      tx.capabilities = this.capabilities
    }

    return tx
  }
}

class TransactionRequest extends ApiRequest {
  /**
   * @param options.body {object} Parsed JSON request body
   * @param options.txStore {FlexDocStore} Transactions store
   */
  constructor (options) {
    super(options)

    this.txStore = options.txStore
    this.body = options.body
  }

  /**
   * Factory method, creates and returns an initialized Transaction request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}

   * @return {TransactionRequest}
   */
  static fromIncoming (req, res) {
    const options = ApiRequest.baseOptions(req, res)
    options.txStore = options.storage.transactions
    options.body = req.body

    return new TransactionRequest(options)
  }

  async handlePost () {
    const { body, response } = this

    this.validate()

    const transaction = await this.loadTransaction(body.handle) ||
      new AuthTransaction(await this.parseTransaction(body))

    await this.storeTransaction(transaction)

    response.status(200).json(transaction)
  }

  async parseTransaction (body) {
    const {
      keys, resources, client_display: clientDisplay, interact, user, capabilities
    } = body

    return {
      keys, resources, clientDisplay, interact, user, capabilities
    }
  }

  async loadTransaction (handle) {
    if (!handle) { return }
    return new AuthTransaction(await this.txStore.get(handle))
  }

  async storeTransaction (transaction) {
    return this.txStore.put(transaction.handle, transaction)
  }

  validate () {
    const { body } = this

    if (!body.keys && !body.key_handle) {
      throw new HttpError(400, '"keys" or "key_handle" parameter is required.')
    }
    if (!body.resources && !body.resource_handle) {
      throw new HttpError(400, '"resources" or "resource_handle" parameter is required.')
    }
    if (!body.interact) {
      throw new HttpError(400, '"interact" parameter is required.')
    }
  }
}

module.exports = TransactionRequest
