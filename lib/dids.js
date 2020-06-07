'use strict'

const Ed25519KeyPair = require('ed25519-key-pair')
const { CryptoLD } = require('crypto-ld')
const cryptoLd = new CryptoLD()
cryptoLd.use(Ed25519KeyPair)

const { DidWebResolver } = require('@interop/did-web-resolver')

const didWeb = new DidWebResolver({ cryptoLd })

async function generateDid ({ url }) {
  const { didDocument, didKeys } = await didWeb.generate({ url })
  console.log(`DID generated: "${didDocument.id}".`)

  return { didDocument, didKeys }
}

module.exports = {
  generateDid
}
