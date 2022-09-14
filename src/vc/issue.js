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
    case 'XRCredential':
      credential = await _xrVc()
      break
    default:
      throw new Error(`Unsupported credential type requested: "${example.type}".`)
  }

  return vcjs.issue({ credential, suite: vcSuite, documentLoader })
}

async function _xrVc () {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      {
        etherealEvent: 'https://w3id.org/xr/v1#etherealEvent',
        EnteredVolumeEvent: 'https://w3id.org/xr/v1#EnteredVolumeEvent',
        CheckpointEvent: 'https://w3id.org/xr/v1#CheckpointEvent',
        checkpointId: 'https://w3id.org/xr/v1#checkpointId'
      },
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    type: [
      'VerifiableCredential',
      'XRCredential'
    ],
    credentialSubject: {
      id: 'did:example:user:1234',
      etherealEvent: [
        {
          type: [
            'EnteredVolumeEvent',
            'CheckpointEvent'
          ],
          checkpointId: '12345'
        }
      ]
    },
    issuer: 'did:key:z6Mkfeco2NSEPeFV3DkjNSabaCza1EoS3CmqLb1eJ5BriiaR',
    issuanceDate: '2022-08-21T23:03:43Z',
    proof: {
      type: 'Ed25519Signature2020',
      created: '2022-08-21T23:03:43Z',
      verificationMethod: 'did:key:z6Mkfeco2NSEPeFV3DkjNSabaCza1EoS3CmqLb1eJ5BriiaR#z6Mkfeco2NSEPeFV3DkjNSabaCza1EoS3CmqLb1eJ5BriiaR',
      proofPurpose: 'assertionMethod',
      proofValue: 'z3SJEYpiejLLgypxuFbhZrgxCfe38ZH78WiVqPEbwCtsghscvzdGXx2RC8dM36U8rUHhwuUK9ebmN9dPs4XTuQdSx'
    }
  }
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
