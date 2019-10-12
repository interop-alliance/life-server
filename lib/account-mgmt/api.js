'use strict'

const express = require('express')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const debug = require('../debug').accounts

const CreateAccountRequest = require('./create-account-request')
const DeleteAccountRequest = require('./delete-account-request')
const DeleteAccountConfirmRequest = require('./delete-account-confirm-request')

/**
 * Returns an Express middleware handler for checking if a particular account
 * exists (used by Signup apps).
 *
 * @param accountManager {AccountManager}
 *
 * @return {Function}
 */
function checkAccountExists (accountManager) {
  return (req, res, next) => {
    const accountUrl = req.hostname

    accountManager.accountUrlExists(accountUrl)
      .then(found => {
        if (!found) {
          debug(`Account ${accountUrl} is available (for ${req.originalUrl})`)
          return res.sendStatus(404)
        }
        debug(`Account ${accountUrl} is not available (for ${req.originalUrl})`)
        next()
      })
      .catch(next)
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
  let router = express.Router('/')

  router.head('/', checkAccountExists(accountManager))

  router.post('/api/accounts/new', bodyParser, CreateAccountRequest.post)
  router.get(['/register', '/api/accounts/new'], CreateAccountRequest.get)

  router.get('/account/delete', DeleteAccountRequest.get)
  router.post('/account/delete', bodyParser, DeleteAccountRequest.post)

  router.get('/account/delete/confirm', DeleteAccountConfirmRequest.get)
  router.post('/account/delete/confirm', bodyParser, DeleteAccountConfirmRequest.post)

  return router
}

module.exports = {
  middleware,
  checkAccountExists
}
