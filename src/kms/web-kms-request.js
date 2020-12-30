/**
 * Copyright 2020 Interop Alliance.
 */
'use strict'

const AuthRequest = require('../authentication/handlers/auth-request')
const { logger } = require('../logger')
const HttpError = require('standard-http-error')
const vc = require('vc-js')

class WebKmsRequest extends AuthRequest {
  constructor ({ challenge, domain, ...options }) {
    super(options)
    this.challenge = challenge
    this.domain = domain
  }

  /**
   * Factory method, creates a request instance.
   *
   * @param req
   * @param res
   *
   * @return {WebKmsRequest}
   */
  static fromIncoming (req, res) {
    const options = AuthRequest.baseOptions(req, res)
    const body = req.body || {}
    options.challenge = body.challenge
    options.domain = body.domain

    return new WebKmsRequest(options)
  }

  static prove () {
    /**
     * @param req {IncomingRequest}
     * @param res {ServerResponse}
     * @param next {Function}
     */
    return async (req, res, next) => {
      try {
        const request = this.fromIncoming(req, res)
        await request.handleProve()
      } catch (error) {
        logger.error(error)
        WebKmsRequest.jsonError(error, res)
      }
    }
  }

  static jsonError (error, res) {
    const statusCode = error.statusCode || 400
    res.status(statusCode).send({ error: error.message })
  }

  async handleProve () {
    const { domain, challenge, accountManager } = this
    const webId = this.credentials.webId
    logger.info(`DIDAuth: Domain '${domain}' requesting VP for user '${webId}'`)

    if (!webId) {
      logger.info('User not logged in, returning 401.')
      throw new HttpError(401)
    }

    const { did, suite, documentLoader } = await accountManager.signingKey({
      webId, purpose: 'authentication'
    })

    const presentation = vc.createPresentation({ holder: did })

    const vp = await vc.signPresentation({
      presentation, suite, challenge, domain, documentLoader
    })

    logger.info('Returning DIDAuth VP.')

    // Send the Verifiable Presentation (used for DIDAuthn)
    this.response.json(vp)
  }
}

module.exports = {
  WebKmsRequest
}
