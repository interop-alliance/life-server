'use strict'

const ACL_SUFFIX = '.acl'
const META_SUFFIX = '.meta'

const DEFAULT_ENCODING = 'utf8'
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
  ACL_SUFFIX,
  META_SUFFIX,
  DEFAULT_RDF_TYPE,
  DEFAULT_ENCODING,
  RDF_MIME_TYPES
}