/**
 * Copyright 2020-2021 Interop Alliance.
 */
'use strict'

const { Ed25519VerificationKey2020 } = require('@digitalbazaar/ed25519-verification-key-2020')
const { X25519KeyAgreementKey2020 } = require('@digitalbazaar/x25519-key-agreement-key-2020')
const { CryptoLD } = require('crypto-ld')
const { Ed25519Signature2020 } = require('@digitalbazaar/ed25519-signature-2020')
const { CachedResolver } = require('@digitalbazaar/did-io')
const { securityLoader } = require('@digitalbazaar/security-document-loader')
const didWeb = require('@interop/did-web-resolver')
const { logger } = require('../util/logger')

const cryptoLd = new CryptoLD()
cryptoLd.use(Ed25519VerificationKey2020)
cryptoLd.use(X25519KeyAgreementKey2020)

const didWebDriver = didWeb.driver({ cryptoLd, logger })

/**
 * Generates a DID (and associated public/private key pairs) for a given user
 * account url.
 * The DID is used as the user id (alongside the Solid WebID); the key pairs
 * get typically stored in a KMS (in the current rough draft implementation,
 * they're stored in the user's `/vault/keys` directory).
 *
 * @param url {string} User account url.
 *
 * @returns {Promise<{methodFor: Function, keyPairs: Map, didDocument: object}>}
 */
async function generateDid ({ url } = {}) {
  if (!url) {
    throw new TypeError('The "url" parameter is required.')
  }
  const { didDocument, keyPairs, methodFor } = await didWebDriver.generate({ url })
  console.log(`DID generated: "${didDocument.id}".`)

  return { didDocument, keyPairs, methodFor }
}

/**
 * @param webId {string}
 * @returns {string}
 */
function didForWebId ({ webId }) {
  const url = new URL(webId)
  // Remove the pathname and hash fragment part of the url
  url.pathname = '/'
  url.hash = ''
  return didWeb.didFromUrl({ url: url.toString() })
}

/**
 * De-serializes exported DID Document keys (converts them from plain JS objects
 * to LDKeyPair instances, useful for authenticating, signing VCs, etc).
 *
 * @param did {string}
 * @param keyData {object} Serialized key data, parsed into JSON.
 *
 * @returns {Promise<Map>} Map of key pair instances, by key id.
 */
async function didKeys ({ did, keyData }) {
  const keyPairs = new Map()
  for (const keyDescription of keyData) {
    keyPairs.set(
      keyDescription.id,
      await cryptoLd.from(keyDescription)
    )
  }

  return keyPairs
}

/**
 * @param didDocument {object} A DID Document for a user.
 * @param keyPairs {Map} Map of public/private key pairs (for a given user
 *   account, loaded from a KMS), by key id.
 * @param purpose {string} e.g. 'assertionMethod', 'authentication' etc.
 *
 * @returns {Ed25519Signature2020} Signature suite instance, for passing to
 *   vc-js.
 */
function keySuite ({ didDocument, keyPairs, purpose } = {}) {
  if (!purpose) {
    throw new TypeError('The "purpose" parameter is required.')
  }
  const { id: keyId } = didWebDriver.publicMethodFor({ didDocument, purpose })
  const keyPair = keyPairs.get(keyId)

  if (!keyPair) {
    throw new Error(`Key id "${keyId}" not found in keyPairs map.`)
  }

  if (keyPair.type !== 'Ed25519VerificationKey2020') {
    throw new Error(`Unsupported verification key type: '${keyPair.type}'.`)
  }

  return new Ed25519Signature2020({ key: keyPair })
}

/**
 * @param didDocument {object} DID Document
 * @param didKeys {object} Hashmap of LDKeyPair instances, by key id
 *
 * @returns {function} Document loader function needed for vc-js etc.
 */
function didWebDocumentLoader ({ didDocument, keyPairs }) {
  const resolver = new CachedResolver()
  resolver.use(didWebDriver)
  const loader = securityLoader()
  loader.setDidResolver(resolver)
  loader.addStatic(didDocument.id, didDocument)
  keyPairs.forEach((keyPair, keyId) => {
    loader.addStatic(
      keyId, keyPair.export({ publicKey: true, includeContext: true })
    )
  })

  const documentLoader = loader.build()

  return async url => documentLoader(url)
}

module.exports = {
  didForWebId,
  didKeys,
  didWebDocumentLoader,
  generateDid,
  keySuite
}
