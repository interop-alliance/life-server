const { logger } = require('../logger')
const Auth = require('../authentication')

// Authentication methods that require a Provider Select page
const SELECT_PROVIDER_AUTH_METHODS = ['oidc']

/**
 * Serves as a last-stop error handler for all other middleware.
 *
 * @param error {Error}
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param next {Function}
 */
function handler (error, req, res, next) {
  logger.warn('Error page because of:' + error)

  const { authMethod } = req.app.locals

  const statusCode = statusCodeFor(error, req, authMethod)

  if (statusCode === 401) {
    // logger.error(err, 'error:', err.error, 'desc:', err.error_description)
    setAuthenticateHeader(req, res, error)
  }

  // if (requiresSelectProvider(authMethod, statusCode, req)) {
  //   return redirectToSelectProvider(req, res)
  // }

  res.status(statusCode)

  if (req.accepts('text/html')) {
    handleErrorHtml({ statusCode, error, req, res })
  } else {
    handleErrorJson({ statusCode, error, req, res })
  }
}

function handleErrorHtml ({ statusCode, error, req, res }) {
  const { host } = req.app.locals

  const session = req.session || {}

  if (statusCode === 404 || statusCode === 401) {
    res.render('errors/notfound', {
      layout: 'wallet',
      isAuthenticated: !!session.userId,
      postLoginRetryPath: host.parseTargetUrl(req),
      title: 'Not Found',
      chapiMediator: host.features.chapiMediator || '',
      serverUri: host.serverUri
    })
  } else {
    res.render('errors/error', {
      layout: 'material',
      title: 'Error',
      statusCode,
      errorMessage: error.message
    })
  }
}

/**
 * Returns the error JSON object in https://tools.ietf.org/html/rfc7807 format.
 * @param statusCode
 * @param error
 * @param req
 * @param res
 */
function handleErrorJson ({ statusCode, error, req, res }) {
  const result = {
    status: statusCode || 400,
    title: error.title ||
      error.error_description || // from OAuth2
      error.name, // default Javascript property for errors
    detail: error.message
  }
  if (error.error_uri) { // from OAuth2
    result.type = error.error_uri
  }
  if (error.instance) {
    result.instance = error.instance
  }
  if (error.code || error.error) { // .error is from OAuth2 errors
    result.code = error.code || error.error
  }
  res.json(result)
}

/**
 * Returns the HTTP status code for a given request error.
 *
 * @param err {Error}
 * @param req {IncomingRequest}
 * @param authMethod {string}
 *
 * @returns {number}
 */
function statusCodeFor (err, req, authMethod) {
  let statusCode = err.status || err.statusCode || 500

  if (err.name === 'HttpError') {
    statusCode = err.code || 500
  }

  if (authMethod === 'oidc') {
    statusCode = Auth.oidc.statusCodeOverride(statusCode, req)
  }

  return statusCode
}

/**
 * Tests whether a given authentication method requires a Select Provider
 * page redirect for 401 error responses.
 *
 * @param authMethod {string}
 * @param statusCode {number}
 * @param req {IncomingRequest}
 *
 * @returns {boolean}
 */
function requiresSelectProvider (authMethod, statusCode, req) {
  if (statusCode !== 401) { return false }

  if (!SELECT_PROVIDER_AUTH_METHODS.includes(authMethod)) { return false }

  if (!req.accepts('text/html')) { return false }

  return true
}

/**
 * Dispatches the writing of the `WWW-Authenticate` response header (used for
 * 401 Unauthorized responses).
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param err {Error}
 */
function setAuthenticateHeader (req, res, err) {
  const locals = req.app.locals
  const authMethod = locals.authMethod

  if (authMethod === 'oidc') {
    Auth.oidc.setAuthenticateHeader(req, res, err)
  }
}

/**
 * Sends a 401 response with an HTML http-equiv type redirect body, to
 * redirect any users requesting a resource directly in the browser to the
 * Select Provider page and login workflow.
 * Implemented as a 401 + redirect body instead of a 302 to provide a useful
 * 401 response to REST/XHR clients.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 */
function redirectToSelectProvider (req, res) {
  res.status(401)
  res.header('Content-Type', 'text/html')

  const { host } = req.app.locals
  const currentUrl = host.parseTargetUrl(req)
  const loginUrl = `${host.serverUri}/api/auth/select-provider?returnToUrl=${encodeURIComponent(currentUrl)}`
  logger.info('Redirecting to Select Provider: ' + loginUrl)

  const body = redirectBody(loginUrl)
  res.send(body)
}

/**
 * Returns a response body for redirecting browsers to a Select Provider /
 * login workflow page. Uses either a JS location.href redirect or an
 * http-equiv type html redirect for no-script conditions.
 *
 * @param url {string}
 *
 * @returns {string} Response body
 */
function redirectBody (url) {
  return `<!DOCTYPE HTML>
<meta charset="UTF-8">
<script>
  window.location.href = "${url}" + encodeURIComponent(window.location.hash)
</script>
<noscript>
  <meta http-equiv="refresh" content="0; url=${url}">
</noscript>
<title>Redirecting...</title>
If you are not redirected automatically,
follow the <a href='${url}'>link to login</a>
`
}

module.exports = {
  handler,
  redirectBody,
  redirectToSelectProvider,
  requiresSelectProvider,
  setAuthenticateHeader
}
