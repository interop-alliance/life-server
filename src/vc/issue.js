'use strict'

const vcjs = require('@digitalcredentials/vc')

/**
 * @param authSuite {LinkedDataSignature} Authentication suite with private key.
 * @param vp {VerifiablePresentation} VP containing the client app's ephemeral
 *   did:key.
 * @param issuer {string} Issuer (the user's) DID.
 * @param documentLoader {function}
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8037 Ed25519 JWT rfc
 * @example
 * {
 *   "kty": "OKP", "crv":"Ed25519", "x": "base64url(pub key)"
 * }
 *
 * @returns {Promise<VerifiableCredential>}
 */
async function issueSolidOidcCredential ({ authSuite, vp, issuer, documentLoader }) {
  const credential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/xr/v1'
    ],
    type: ['VerifiableCredential', 'SolidOidcCredential'],
    issuer,
    credentialSubject: {
    }
  }
  return vcjs.issue({ credential, suite: authSuite, documentLoader })
}

/**
 * Issues a VC based on a VPR (Verifiable Presentation Request)
 * "query by example" query.
 *
 * @see https://w3c-ccg.github.io/vp-request-spec/
 *
 * @param example {object} VPR query for a single credential.
 * @param did {string}
 * @param username {string} Account name (the subdomain prefix).
 * @param vcSuite
 * @param documentLoader {function}
 *
 * @return {Promise<VerifiableCredential>}
 */
async function issueVcFromExample ({ example, did, username, vcSuite, documentLoader }) {
  let credential

  switch (example.type) {
    case 'LoginDisplayCredential':
      credential = await _loginDisplayCredential({ did, username })
      break
    case 'UserPreferencesCredential':
      credential = await _userPreferencesCredential({ did })
      break
    default:
      throw new Error(`Unsupported credential type requested: "${example.type}".`)
  }

  return vcjs.issue({ credential, suite: vcSuite, documentLoader })
}

async function _loginDisplayCredential ({ did, username }) {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/xr/v1'
    ],
    type: ['VerifiableCredential', 'LoginDisplayCredential'],
    issuer: did,
    credentialSubject: {
      id: did,
      displayName: username,
      // TODO: Load from user profile
      displayIcon: 'https://material-ui.com/static/images/avatar/1.jpg'
    }
  }
}

async function _userPreferencesCredential ({ did }) {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/xr/v1'
    ],
    type: ['VerifiableCredential', 'UserPreferencesCredential'],
    issuer: did,
    credentialSubject: {
      id: did
      // TODO: Figure out what XR Engine's minimal user prefs are
    }
  }
}

module.exports = {
  issueSolidOidcCredential,
  issueVcFromExample,
  // Exported for unit tests only
  _loginDisplayCredential,
  _userPreferencesCredential
}
