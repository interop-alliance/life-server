'use strict'

const ACL_SUFFIX = '.acl'
const META_SUFFIX = '.meta'

const DEFAULT_ENCODING = 'utf8'
const DEFAULT_RDF_TYPE = 'text/turtle'

const RDF_MIME_TYPES = [
  'text/turtle', // .ttl
  'text/n3', // .n3
  'text/html', // RDFa
  'application/xhtml+xml', // RDFa
  'application/n3',
  'application/nquads',
  'application/n-quads',
  'application/rdf+xml', // .rdf
  'application/ld+json', // .jsonld
  'application/x-turtle'
]

module.exports = {
  ACL_SUFFIX,
  META_SUFFIX,
  DEFAULT_RDF_TYPE,
  DEFAULT_ENCODING,
  RDF_MIME_TYPES,

  auth: 'oidc',
  localAuth: {
    password: true
  },
  configPath: './config',
  dbPath: './.db',
  port: 7070,
  serverUri: 'https://localhost:7070',
  root: './data',

  // Enable WebID authentication and access control (uses HTTPS)
  webid: true,

  // Serve on a specific URL path (default: '/')
  mount: '/',

  // Enable multi-user mode
  multiuser: false,

  // Path to the SSL private key in PEM format
  sslKey: '../privkey.pem',

  // Path to the SSL certificate key in PEM format
  sslCert: '../fullchain.pem'

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
