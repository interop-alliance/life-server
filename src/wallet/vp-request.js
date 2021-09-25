'use strict'

const { ApiRequest } = require('../server/api-request')
const { issueSolidOidcCredential, issueVcFromExample } = require('../vc/issue')
const vcjs = require('@digitalcredentials/vc')

class VpRequest extends ApiRequest {
  /**
   * static post () - implemented in ApiClass, calls handlePost()
   */

  /**
   * Processes a Verifiable Presentation request from a client.
   * Note that this only handles authenticated requests (so, it's appropriate
   * to use in wallet apps,e tc).
   *
   * @example
   * POST /api/presentations/verify
   * {
   *   domain: 'wallet.example.com',
   *   challenge: '99612b24-63d9-11ea-b99f-4f66f3e4f81a',
   *   query: [
   *     { type: 'DIDAuth' },
   *     { type: 'SolidOidcCredential', vp },
   *     {
   *       type: 'QueryByExample',
   *       credentialQuery: [ { example }, { example }, ... ]
   *     }
   *   ]
   * }
   *
   * @returns {Promise<void>}
   */
  async handlePost () {
    try {
      const { credentials: { webId }, accountManager } = this

      const { domain, challenge, query } = this.body
      // const { serverUri, features } = this.host

      if (!webId) {
        return this.errorJson(
          new Error('Authentication required.'), { statusCode: 401 })
      }

      const verifiableCredential = [] // Assume it's an array for simplicity
      const { did, suite: authSuite, documentLoader } = accountManager
        .signingKey({ webId, purpose: 'authentication' })

      // Determine whether to sign the VP (and add the holder property)
      const didAuth = query.find(q => q.type === 'DIDAuth')

      // Determine if a Solid OIDC access token was requested
      const accessTokenRequest = query.find(q => q.type === 'SolidOidcCredential')
      if (accessTokenRequest) {
        verifiableCredential.push(
          await issueSolidOidcCredential({
            authSuite, vp: accessTokenRequest.vp
          })
        )
      }

      // Determine if any VCs need to be issued
      const queryByExample = query.find(q => q.type === 'QueryByExample')
      const { suite: vcSuite } = accountManager
        .signingKey({ webId, purpose: 'assertionMethod' })
      if (queryByExample) {
        for (const { example } of queryByExample.credentialQuery) {
          const vc = await issueVcFromExample({
            example, did, vcSuite, documentLoader
          })
          if (vc) {
            verifiableCredential.push(vc)
          }
        }
      }

      const presentation = vcjs.createPresentation()
      let signedPresentation

      if (didAuth) {
        presentation.holder = did
        signedPresentation = await vcjs.signPresentation({
          presentation, suite: authSuite, domain, challenge, documentLoader
        })
      }
      this.response.json({
        presentation: signedPresentation || presentation
      })
    } catch (error) {
      // General catch-all
      this.errorJson(error)
    }
  }
}

module.exports = {
  VpRequest
}
