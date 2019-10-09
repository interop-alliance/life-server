'use strict'

module.exports = {
  'auth': 'oidc',
  'localAuth': {
    'password': true
  },
  'configPath': './config',
  'dbPath': './.db',
  'port': 8443,
  'serverUri': 'https://localhost:8443',
  'root': './data',
  'webid': true,
  'suffixAcl': '.acl',
  'suffixMeta': '.meta'
}
