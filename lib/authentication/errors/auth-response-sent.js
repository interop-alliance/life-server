'use strict'

class AuthResponseSent extends Error {
  constructor (message) {
    super(message)

    this.handled = true
  }
}

module.exports = AuthResponseSent
