module.exports = {
  configPath: '.',
  configFile: 'config.dev.js',

  // External server uri
  serverUri: 'https://localhost:8443',
  port: '8443',

  // Mount server on this url path (soon to be deprecated)
  mount: '/',

  // true - enables authentication and access control system
  webid: true,

  // Authentication override - for debugging purposes. Uncomment to
  // force authentication to always use this username
  // forceUser: 'https://localhost:8443/web#id',

  // Location of user database and authentication related config dbs
  dbPath: './.db/',

  // Location of the SSL certificate private key and certificate chain
  // These do not get generated automatically, you must create them yourself
  sslKey: './privkey.pem',
  sslCert: './fullchain.pem',

  // Single-user configuration
  multiuser: false,
  root: './data/singleuser/', // User data directory

  // Multi-user configuration
  // multiuser: true,
  // root: './data/',

  // Optional email settings (these enable the sending of 'account created'
  // and account recovery emails
  // email: {
  //   host: 'smtp.mailtrap.io', // mailtrap.io is only used as an example
  //   port: '2525',
  //   secure: true,
  //   auth: {
  //     user: '',
  //     pass: ''
  //   }
  // },

  server: {
    // A name for your server (not required, but will be presented on your server's front page)
    name: '',
    // A description of your server (not required)
    description: '',
    // A logo that represents you, your brand, or your server (not required)
    logo: '',
    // The support email you provide for your users (not required)
    supportEmail: ''
  }
}
