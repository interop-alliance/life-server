'use strict'

// const { keyStore, exportKeys } = require('did-cli/lib/storage')
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

// write did document
// console.log('Writing acl:', path.resolve(serverFolder, '.acl'))
// await fs.ensureDir(serverFolder)
// await fs.writeFile(path.resolve(serverFolder, '.acl'), publicAcl)
// await fs.writeFile(didFilename, JSON.stringify(didDocument, null, 2))
// console.log(`Server DID Document written to "${didFilename}".`)

// export keys
// await fs.ensureDir(keyStorage)
// await keyStore({ dir: keyStorage })
//   .put(didDocument.id, await exportKeys(didKeys))
// console.log(`Keys written to "${keyStorage}".`)

module.exports = {
  generateDid
}
