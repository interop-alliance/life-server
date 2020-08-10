/**
 * Copyright 2020 Interop Alliance.
 */
'use strict'

const { URL } = require('url')
const { Ed25519VerificationKey2018 } = require('@digitalbazaar/ed25519-verification-key-2018')
const { CryptoLD } = require('crypto-ld')
const cryptoLd = new CryptoLD()
cryptoLd.use(Ed25519VerificationKey2018)
const { Ed25519Signature2018 } = require('@digitalbazaar/ed25519-signature-2018')
const { defaultDocumentLoader } = require('vc-js')
const { contexts: didContexts } = require('did-context')

const { DidWebResolver, didFromUrl } = require('@interop/did-web-resolver')

const didWeb = new DidWebResolver({ cryptoLd })

async function generateDid ({ url }) {
  const { didDocument, didKeys } = await didWeb.generate({ url })
  console.log(`DID generated: "${didDocument.id}".`)

  return { didDocument, didKeys }
}

/**
 * @param webId {string}
 * @returns {string}
 */
function didForWebId ({ webId }) {
  const url = new URL(webId)
  url.pathname = '/'
  return didFromUrl({ url: url.toString() })
}

/**
 * De-serializes exported DID Document keys.
 *
 * @param keyData {object} Serialized key data, parsed into JSON.
 *
 * @returns {Promise<object>} Hashmap of key pair instances, by key id.
 */
async function didKeys ({ did, keyData }) {
  const didKeys = {}
  for (const keyId in keyData) {
    didKeys[keyId] = await cryptoLd.from({
      controller: did,
      ...keyData[keyId]
    }) // create LDKeyPair
  }

  return didKeys
}

function keySuite ({ key }) {
  if (key.type !== 'Ed25519VerificationKey2018') {
    throw new Error(`Unsupported key type: '${key.type}'.`)
  }

  return new Ed25519Signature2018({
    verificationMethod: key.id,
    key
  })
}

/**
 * @param didDocument {object} DID Document
 * @param didKeys {object} Hashmap of LDKeyPair instances, by key id
 *
 * @returns {function} Document loader function needed for vc-js etc.
 */
function didWebDocumentLoader ({ didDocument, didKeys }) {
  return async url => {
    let document

    if (url === didDocument.id) {
      document = didDocument
    }
    if (url in didKeys) {
      document = didKeys[url].export({ publicKey: true })
    }
    if (didContexts.has(url)) {
      document = didContexts.get(url)
    }
    if (document) {
      return {
        contextUrl: null,
        documentUrl: url,
        document: document
      }
    }

    return defaultDocumentLoader(url)
  }
}

module.exports = {
  didForWebId,
  didKeys,
  didWebDocumentLoader,
  generateDid,
  keySuite
}
