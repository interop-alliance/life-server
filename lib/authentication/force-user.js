const { logger } = require('./../logger')

/**
 * Enforces the `--force-user` server flag, hardcoding a webid for all requests,
 * for testing purposes.
 *
 * Note: It's async only to match the signature of other auth methods.
 */
async function initialize (app, argv) {
  const forceUserId = argv.forceUser
  app.use('/', (req, res, next) => {
    logger.warn(`Identified user (override): ${forceUserId}`)
    req.session.userId = forceUserId
    next()
  })
}

module.exports = {
  initialize
}
