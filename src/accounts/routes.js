'use strict'

const express = require('express')
const bodyParserJson = express.json()
const bodyParserForm = express.urlencoded({ extended: false })
const { logger } = require('../logger')
const HttpError = require('standard-http-error')

const { ApiRequest } = require('../api-request')
const { CreateAccountRequest } = require('./handlers/create-account-request')
const { RegisterWalletRequest } = require('../wallet/register-wallet-request')
const { WalletRequest } = require('../wallet/wallet-request')
const { WebKmsRequest } = require('../kms/web-kms-request')
const DeleteAccountRequest = require('./handlers/delete-account-request')
const DeleteAccountConfirmRequest = require('./handlers/delete-account-confirm-request')

function checkFeatureFlag (name) {
  return (req, res, next) => {
    const { host: { features } } = ApiRequest.baseOptions(req, res)

    if (features[name] !== undefined && !features[name]) {
      logger.warn(`Feature '${name}' is disabled.`)
      return next(new HttpError(400, 'This feature or API endpoint is disabled.'))
    }
    next()
  }
}

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

  router.post('/api/accounts/new', checkFeatureFlag('allowAccountCreation'),
    bodyParserJson, CreateAccountRequest.post())
  router.get(['/register', '/api/accounts/new'], checkFeatureFlag('allowAccountCreation'),
    CreateAccountRequest.get())

  router.post('/api/prove/presentations', express.json(), WebKmsRequest.prove())

  router.get('/api/wallet/new', RegisterWalletRequest.get())
  router.post('/api/wallet/new', RegisterWalletRequest.post())

  router.get('/api/wallet/worker', WalletRequest.getWorker())
  router.get('/api/wallet/get', WalletRequest.getOperationUi())
  router.get('/api/wallet/store', WalletRequest.storeOperationUi())

  router.get('/account/delete', DeleteAccountRequest.get())
  router.post('/account/delete', bodyParserForm, DeleteAccountRequest.post())

  router.get('/account/delete/confirm', DeleteAccountConfirmRequest.get())
  router.post('/account/delete/confirm', bodyParserForm,
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
