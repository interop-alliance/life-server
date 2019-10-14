const { logger } = require('./../logger')

/**
 * Enforces the `--force-user` server flag, hardcoding a webid for all requests,
 * for testing purposes.
 */
function initialize (app, argv) {
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
