'use strict'

const { URL } = require('whatwg-url')
const validUrl = require('valid-url')
const fetch = require('node-fetch')
const li = require('li')
const rdf = require('rdflib')
const { fetchRemoteGraph } = require('../rdf')

module.exports = {
  discoverProviderFor,
  parseProviderLink,
  preferredProviderFor,
  providerExists,
  validateProviderUri
}

/**
 * @param uri {string} Provider URI or Web ID URI
 *
 * @returns {Promise<string>}
 */
async function preferredProviderFor (uri) {
  // First, determine if the uri is an OIDC provider
  const providerUri = await providerExists(uri)
  if (providerUri) {
    return providerUri // the given uri's origin hosts an OIDC provider
  }

  // Given uri is not a provider (for example, a static Web ID profile URI)
  // Discover its preferred provider
  return discoverProviderFor(uri)
}

/**
 * @param uri {string} Provider URI or Web ID URI
 *
 * @returns {Promise<string|null>} Returns the Provider URI origin if an OIDC
 *   provider exists at the given uri, or `null` if none exists
 */
async function providerExists (uri) {
  const providerOrigin = (new URL(uri)).origin
  const providerConfigUri = providerOrigin + '/.well-known/openid-configuration'

  const result = await fetch(providerConfigUri, { method: 'HEAD' })
  return result.ok ? providerOrigin : null
}

/**
 *
 * @param webId {string} Web ID URI
 *
 * @returns {Promise<string>} Resolves with the preferred provider uri for the
 *  given Web ID, extracted from Link rel header or profile body. If no
 *  provider URI was found, reject with an error.
 *
 *  @returns {string} Resolves with valid provider uri
 */
async function discoverProviderFor (webId) {
  let providerUri
  providerUri = await discoverFromHeaders(webId) ||
    await discoverFromProfile(webId)

  // drop the path (provider origin only)
  if (providerUri) {
    providerUri = (new URL(providerUri)).origin
  }
  validateProviderUri(providerUri, webId) // Throw an error if empty or invalid

  return providerUri
}

/**
 * @param webId {string}
 *
 * @returns {Promise<string|undefined>}
 */
async function discoverFromHeaders (webId) {
  const response = await fetch(webId, { method: 'OPTIONS' })
  if (response.ok) {
    return parseProviderLink(response.headers)
  }
}

/**
 * @param webId
 *
 * @throws {Error}
 * @returns {Promise<string>}
 */
async function discoverFromProfile (webId) {
  let providerUri
  try {
    const graph = await fetchRemoteGraph({ url: webId })

    const providerTerm = rdf.namedNode('http://www.w3.org/ns/solid/terms#oidcIssuer')
    providerUri = graph.anyValue(rdf.namedNode(webId), providerTerm)
  } catch (err) {
    const error = new Error(`Could not reach Web ID ${webId} to discover provider`)
    error.cause = err
    error.statusCode = 400
    throw error
  }
  return providerUri
}

/**
 * Returns the contents of the OIDC issuer Link rel header.
 *
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#IssuerDiscovery
 *
 * @param headers {Headers} Response headers from an OPTIONS call
 *
 * @return {string}
 */
function parseProviderLink (headers) {
  const links = li.parse(headers.get('link')) || {}

  return links['http://openid.net/specs/connect/1.0/issuer']
}

/**
 * Validates a preferred provider uri (makes sure it's a well-formed URI).
 *
 * @param provider {string} Identity provider URI
 *
 * @throws {Error} If the URI is invalid
 */
function validateProviderUri (provider, webId) {
  if (!provider) {
    const error = new Error(`OIDC issuer not advertised for ${webId}.
    See https://github.com/solid/webid-oidc-spec#authorized-oidc-issuer-discovery`)
    error.statusCode = 400
    throw error
  }

  if (!validUrl.isUri(provider)) {
    const error = new Error(`OIDC issuer for ${webId} is not a valid URI: ${provider}`)
    error.statusCode = 400
    throw error
  }
}
