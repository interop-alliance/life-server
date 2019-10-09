'use strict'

const { initMapper, initStorage } = require('../lib/server-config')

function testAccountManagerOptions (host, options = {}) {
  const mapper = initMapper(host)
  const storage = initStorage({ host, mapper })
  const ldpStore = storage.accountStore()
  return { host, ldpStore, ...options }
}

module.exports = {
  testAccountManagerOptions
}
