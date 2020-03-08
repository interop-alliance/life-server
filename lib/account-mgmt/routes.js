'use strict'

const express = require('express')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const { logger } = require('../logger')

const { CreateAccountRequest } = require('./create-account-request')
const DeleteAccountRequest = require('./delete-account-request')
const DeleteAccountConfirmRequest = require('./delete-account-confirm-request')

/**
 * Returns an Express router for providing user account related middleware
 * handlers.
 *
 * @param accountManager {AccountManager}
 *
 * @return {Router}
 */
function middleware (accountManager) {
  const router = express.Router('/')

  router.head('/', checkAccountExists(accountManager))

  router.post('/api/accounts/new', bodyParser, CreateAccountRequest.post())
  router.get(['/register', '/api/accounts/new'], CreateAccountRequest.get())

  router.get('/account/delete', DeleteAccountRequest.get())
  router.post('/account/delete', bodyParser, DeleteAccountRequest.post())

  router.get('/account/delete/confirm', DeleteAccountConfirmRequest.get())
  router.post('/account/delete/confirm', bodyParser,
    DeleteAccountConfirmRequest.post())

  return router
}

/**
 * Returns an Express middleware handler for checking if a particular account
 * exists (used by Signup apps).
 *
 * @param accountManager {AccountManager}
 *
 * @return {Function}
 */
function checkAccountExists (accountManager) {
  return async (req, res, next) => {
    const { host } = req.app.locals
    const accountUrl = host.parseTargetUrl(req)

    try {
      const found = await accountManager.accountUrlExists(accountUrl)
      if (!found) {
        logger.info(`Account ${accountUrl} is available (for ${req.originalUrl})`)
        return res.sendStatus(404)
      }
      logger.info(`Account ${accountUrl} is not available (for ${req.originalUrl})`)
      next()
    } catch (error) {
      next(error)
    }
  }
}

module.exports = {
  middleware,
  checkAccountExists
}
