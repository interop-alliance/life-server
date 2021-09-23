'use strict'

const vcjs = require('@digitalbazaar/vc')

async function issueSolidOidcCredential ({ authSuite, vp }) {}

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
    issuer: '<this pods DID>',
    issuanceDate: '<set to now>',
    credentialSubject: {
      id: did,
      displayName: '<load from user profile>',
      displayIcon: '<load from user profile>'
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
    issuer: '<this pods DID>',
    issuanceDate: '<set to now>',
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
