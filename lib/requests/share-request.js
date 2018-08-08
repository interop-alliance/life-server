'use strict'

class ShareRequest {
  static async get (req, res) {
    console.log('Share from:', req.query.url)
  }
}

module.exports = ShareRequest
