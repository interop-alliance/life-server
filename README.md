# Life Server _(life-server)_

> A decentralized personal data server inspired by Solid

## Table of Contents

- [Background](#background)
    - [Audience](#audience)
    - [Roadmap](#roadmap)
    - [Differences from Solid Server](#differences-from-solid-server)
- [Install](#install)
- [Usage](#usage)
- [Security](#security)
- [Contribute](#contribute)
- [License](#license)

## Background

Life Server is personal data server written in Node.js, originally
based on MIT's [Solid Server](https://github.com/solid/node-solid-server).

### Audience

This server is intended for the following audiences:

1. (primarily) Myself. I'm using this as an experimental platform for incubating
    and implementing various [Solid-related](https://github.com/solid/specification)
    and Solid-adjacent specifications and standards.
1. (hopefully) Other developers of user centric offline-first decentralized 
    applications.
1. (to a much smaller extent) End-users interested in running their own file
    sharing server (a minimal Dropbox/Google Drive sort of setup). This server
    is not really ready for mainstream (or even early adopter) usage. 
1. (almost not at all) For system administrators / potential service providers
   interested in running their own multi-user data server.

To put it another way, due to a shortage of engineering resources, the
priorities will be: Developer QoL (Quality of Life) over User QoL over DevOps QoL.

### Roadmap

This is an experimental server focusing on interop exploration and rapid feature 
iteration ("move fast and break things", to use a tired cliché).

#### Roadmap Phase One

This phase focuses on general cleanup and refactoring from the source 
`node-solid-server` v4 baseline.

* [x] Remove external dependency on Mashlib and the Data Browser. (The various 
    built-in apps (account homepage, data viewing and file management, sharing 
    and permission management, etc) will be performed on the server side.)
* [x] Simplify architecture, remove a number of non-core components (globbing,
    realtime updates via WebSockets, WebID-TLS local authentication, CORS proxy
    and authentication proxy, storage quotas).
* [x] Refactor the LDP interface to more closely match the [proposed Solid 
    architecture](https://github.com/solid/solid-architecture/blob/master/server/request-flow.md), 
    and to support modular/pluggable storage backends
    beyond the existing File System based one (such as an in-memory store, graph 
    stores and others).
* [x] Bring some external authn-related dependencies (such as the 
    [`oidc-auth-manager`](https://github.com/solid/oidc-auth-manager) and the 
    [`solid-multi-rp-client`](https://github.com/solid/solid-multi-rp-client))
    libs into this repository (to make for a faster release and refactoring
    process).
* [x] Replace logging layer (currently a mix of `console` and `debug`) with a
    dedicated logger like Bunyan or Pino.
* [x] Shorten the WebID Profile URL template for new accounts from
    `/profile/card#me` to `/web#id`
* [ ] Simplify the new account templating system
* [ ] Update `node-mailer` package to latest version
* [ ] Update `inquirer` to package latest version

#### Roadmap Phase Two

This phase focuses on exploring some advanced features that may make it into
Solid spec proposals, as well as integration with external Solid-adjacent
projects and specs.

* [ ] Implement an in-Memory based LDP backend, to go alongside the FS backend.
* [ ] Integrate or implement Static OIDC Client Registration functionality,
    to make interfacing with server-side Solid apps easier.
* [ ] Investigate level of effort required to switch from the current `oidc-op`
    OpenID Connect Provider library to a more widely supported one, such as
    Filip's [`node-oidc-provider`](https://github.com/panva/node-oidc-provider)
    lib.
* [ ] Implement a server-side metadata mechanism, to support being able to
    [record who created a resource](https://github.com/solid/specification/issues/66)
* [ ] _(in progress)_ Experimental integration with 
    [CouchDB](http://docs.couchdb.org/en/latest/intro/)
    (for synchronizing of graphs and documents to mobile and offline-first 
    clients).
* [ ] Explore interop with DIDs and Verifiable Credentials
    * Support the [`did:web`](https://github.com/w3c-ccg/did-method-web), 
        [`did:key`](https://github.com/digitalbazaar/did-method-key-js) and 
        [Veres One](https://github.com/w3c-ccg/didm-veres-one) DID methods.
* [ ] Explore using an [Encrypted Data Vault](https://github.com/WebOfTrustInfo/rwot9-prague/blob/master/draft-documents/encrypted-data-vaults.md)
    as a storage backend. This would require some basic Key Management capability,
    possible based on the [Web KMS spec](https://github.com/msporny/webkms).
* [ ] Interop with the Fediverse by implementing [ActivityPub](https://activitypub.rocks/)
    protocol.

### Differences from Solid Server

Since [`node-solid-server`](https://github.com/solid/node-solid-server) (NSS) is 
being deprecated in favor of [`inrupt/pod-server`](https://github.com/inrupt/pod-server),
this repo intends to be another compatible implementation (the more the merrier!).

**Does not support:**

* Not published to `npm`, intended to be installed and run from git.
* Using an external WebID on signup 
* `acl:origin` checking or Trusted Apps (uses [`solid-permissions`](https://github.com/interop-alliance/solid-permissions)  
    instead of [`acl-check.js`](https://github.com/solid/acl-check) for access control)
* Password strength checking on account signup.
* Enforcement of storage space quotas
* WebID-TLS local authentication
* WebSockets
* Globbing

### Value Proposition for Developers

See [Solid and Life Server Value Proposition for Developers](docs/value-proposition.md) 
doc.

## Install

### Pre-requisites: Node.js v10

* Linux or Mac OS X
* Node 10
* [Optional] OpenSSL (for certificate generation)

**Operating System:** Linux and Mac OS X. Windows is currently not supported
for this project.

To run the Life Server server, you will first need to install
Node.js version 10 or higher. (The developers recommend using
[`nvm`](https://github.com/creationix/nvm) to install Node.)

(Optional) If you intend to create a self-signed certificate (for local testing),
you will also need OpenSSL.

### Install `life-server` from Github

```bash
git clone https://github.com/interop-alliance/life-server.git
cd life-server
npm install
```

### Prepare the SSL certificate

**Local/Development:** Installing the server for local development and testing
will require an SSL certificate. You can generate a self-signed certificate
yourself (see [Generating a self-signed SSL certificate](docs/ssl-certificates.md)
in `docs/`), but remember to launch the server using `./bin/solid-test` rather
than `./bin/solid`.

**Production:** Installing `life-server` in a production environment will
require a valid SSL certificate (self-signed certs will not work). In addition,
if you're running the server in Multi User mode, you will need a
[Wildcard Certificate](https://en.wikipedia.org/wiki/Wildcard_certificate).

### Edit `/etc/hosts` (development/testing only)

To run the account creation on unit tests, `life-server`'s test suite
uses the following localhost domains: `nic.localhost`, `tim.localhost`, and
`nicola.localhost`. You will need to create host file entries for these, in
order for the tests to pass.

Edit your `/etc/hosts` file, and append:

```
# Used for unit testing
127.0.0.1 nic.localhost
127.0.0.1 tim.localhost
127.0.0.1 nicola.localhost
```

### Generate a config file

The easiest way to setup `life-server` is by running the `init` wizard.
This will create a `config.json` in your current folder:

```
./bin/solid init
```

Going with the defaults is fine, but note that you will need the paths
(relative paths are ok) to your SSL key and certificate.

## Usage

To run your server (once you've generated a config file):

```
./bin/solid start
```

or when using a self-signed certificate:

```
./bin/solid-test start
```

After startup, the server is available at the configured server URL (by default,
`https://localhost:8443`).

## Security

TBD

Note: This is an experimental research server, not for production use.

## Contribute

Life Server is only possible because of a large community of [Solid contributors](https://github.com/solid/node-solid-server/blob/master/CONTRIBUTORS.md).
A heartfelt thank you to everyone for all of your efforts!

## License

[The MIT License](LICENSE.md)
