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
  'webid': true

  // "email": {
  //   "host": "smtp.mailtrap.io",
  //   "port": "2525",
  //   "auth": {
  //     "user": "***",
  //     "pass": "***"
  //   }
  // }

  // 'couchdb': {
  //   username: 'admin',
  //   password: '***',
  //   url: 'http://localhost:5984'
  // }
}
