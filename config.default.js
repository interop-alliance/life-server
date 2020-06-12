module.exports = {
  configPath: '.',
  configFile: 'config.default.js',

  // External server uri
  serverUri: 'https://localhost:7070',
  port: '7070',

  // Single-user configuration
  multiuser: false,
  root: './data/singleuser/', // User data directory

  // Multi-user configuration
  // multiuser: true,
  // root: './data/multiuser/',

  // Location of user database and authentication related config dbs
  dbPath: './data/db/',

  // Mount server on this url path (soon to be deprecated)
  mount: '/',

  // true - enables authentication and access control system
  webid: true,

  // Authentication override - for debugging purposes. Uncomment to
  // force authentication to always use this username
  // forceUser: 'https://localhost:8443/web#id',

  // Location of the SSL certificate private key and certificate chain
  // These do not get generated automatically, you must create them yourself
  sslKey: './config/localhost.privkey.pem',
  sslCert: './config/localhost.fullchain.pem',

  // Optional email settings (these enable the sending of 'account created'
  // and account recovery emails
  // email: {
  //   host: 'smtp.mailtrap.io', // mailtrap.io is only used as an example
  //   port: '2525',
  //   secure: false,
  //   auth: {
  //     user: '',
  //     pass: ''
  //   }
  // },

  server: {
    // A name for your server (not required)
    name: '',
    // A description of your server (not required)
    description: '',
    // A logo that represents you, your brand, or your server (not required)
    logo: '',
    // The support email you provide for your users (not required)
    supportEmail: ''
  }
}
