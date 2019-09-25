'use strict'

const DEFAULT_ACL_SUFFIX = '.acl'

const DEFAULT_RDF_TYPE = 'text/turtle'

const RDF_MIME_TYPES = [
  'text/turtle',            // .ttl
  'text/n3',                // .n3
  'text/html',              // RDFa
  'application/xhtml+xml',  // RDFa
  'application/n3',
  'application/nquads',
  'application/n-quads',
  'application/rdf+xml',    // .rdf
  'application/ld+json',    // .jsonld
  'application/x-turtle'
]

module.exports = {
  DEFAULT_ACL_SUFFIX,
  DEFAULT_RDF_TYPE,
  RDF_MIME_TYPES,
}
