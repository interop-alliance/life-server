'use strict'

const vcjs = require('@digitalcredentials/vc')

/**
 * @param authSuite {LinkedDataSignature} Authentication suite with private key.
 * @param vp {VerifiablePresentation} VP containing the client app's ephemeral
 *   did:key.
 * @param issuer {string} This server.
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

async function issueVcFromExample ({ example, did, vcSuite, documentLoader }) {
  let credential

  switch (example.type) {
    case 'LoginDisplayCredential':
      credential = await _loginDisplayCredential({ did })
      break
    case 'UserPreferencesCredential':
      credential = await _userPreferencesCredential({ did })
      break
    default:
      throw new Error(`Unsupported credential type requested: "${example.type}".`)
  }

  return vcjs.issue({ credential, suite: vcSuite, documentLoader })
}

async function _loginDisplayCredential ({ did }) {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/xr/v1'
    ],
    type: ['VerifiableCredential', 'LoginDisplayCredential'],
    issuer: did,
    credentialSubject: {
      id: did,
      // TODO: Load from user profile
      displayName: 'Dmitri',
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
