# Life Server _(life-server)_

[![Build status](https://img.shields.io/github/workflow/status/interop-alliance/life-server/Node.js%20CI)](https://github.com/interop-alliance/life-server/actions?query=workflow%3A%22Node.js+CI%22)
[![NPM Version](https://img.shields.io/npm/v/life-server.svg?style=flat-square)](https://npm.im/life-server)

> A decentralized personal data server inspired by Solid and Decentralized Web Node.

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

**Important:** For upgrade notes and change history, see 
**[CHANGELOG.md](CHANGELOG.md)**.

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
iteration. "Move fast and break things (and then fix them just as quickly)", to 
use a tired cliché.

#### Roadmap Phase One (Complete)

This phase focused on general cleanup and refactoring from the source
`node-solid-server` v4 baseline. (See [Phase One details](docs/roadmap.md#roadmap-phase-one-complete).)

#### Roadmap Phase Two

This phase focuses on exploring some advanced features that may make it into
Solid spec proposals, as well as integration with external Solid-adjacent
projects and specs.

* [x] Fix/update Dockerfile
* [ ] DID Integration
    * [x] Generate a [`did:web`](https://github.com/w3c-ccg/did-method-web) DID
      and corresponding keys for the Server itself, during installation.
    * [x] Generate a [`did:web`](https://github.com/w3c-ccg/did-method-web) DID
      and corresponding keys for each user on account registration.
    * [ ] (in progress) Implement DIDAuth for wallet, hook it up to Login page.
    * [ ] Add [`did:key`](https://github.com/digitalbazaar/did-method-key-js)
        support
    * [ ] Add [Veres One](https://github.com/w3c-ccg/didm-veres-one) DIDs support
* [ ] Interop with Verifiable Credentials
    * [x] Implement 
      [Credential Handler API Wallet](https://github.com/digitalbazaar/credential-handler-polyfill)
      registration when user creates an account.
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
* [ ] Explore using an [Encrypted Data Vault](https://github.com/decentralized-identity/secure-data-store)
    as a storage backend. This would require some basic Key Management capability,
    possible based on the [Web KMS spec](http://w3c-ccg.github.io/webkms/).
* [ ] Interop with the Fediverse by implementing [ActivityPub](https://activitypub.rocks/)
    protocol.

### Differences from Solid Server

Since [`node-solid-server`](https://github.com/solid/node-solid-server) (NSS) is 
being deprecated in favor of [`inrupt/pod-server`](https://github.com/inrupt/pod-server),
this repo intends to be another compatible implementation (the more the merrier!).

* Works on Windows 10 (WSL2)

**Does not support:**

* Using an external WebID on signup 
* `acl:origin` checking or Trusted Apps (uses [`solid-permissions`](https://github.com/interop-alliance/solid-permissions)  
    instead of [`acl-check.js`](https://github.com/solid/acl-check) for access control)
* `acl:trustedOrigin` (removed on purpose during refactoring)
* Password strength checking on account signup.
* Enforcement of storage space quotas
* WebID-TLS local authentication
* WebSockets
* Globbing

### Value Proposition for Developers

See [Solid and Life Server Value Proposition for Developers](docs/value-proposition.md) 
doc.

## Install

### Pre-requisites: Node.js v14+

* Linux, Mac OS X, or Windows 10
* Node 14+

To run Life Server, you will first need to install
Node.js. (The developers recommend using [`nvm`](https://github.com/creationix/nvm) 
to install Node.)

### Install `life-server` from Github

```bash
git clone https://github.com/interop-alliance/life-server.git
cd life-server
npm install
```

### Edit `/etc/hosts` (development/testing only)

`life-server`'s test suite uses the following localhost domains: `nic.localhost`, `tim.localhost`, and
`nicola.localhost`. You will need to create host file entries for these, in
order for the tests to pass.

Edit your `/etc/hosts` file, and append:

```
# Used for unit testing
127.0.0.1 nic.localhost
127.0.0.1 tim.localhost
127.0.0.1 nicola.localhost
```

### (Optional) Prepare the SSL/TLS certificate

**Local/Development:** `life-server` includes a default `localhost` self-signed
TLS certificate in the `config/` folder. Advanced users may want to create
their own certificates for local testing.

**Production:** Installing `life-server` in a production environment will
require a valid TLS certificate (self-signed certs will not work). In addition,
if you're running the server in Multi User mode, you will need a
[Wildcard Certificate](https://en.wikipedia.org/wiki/Wildcard_certificate).

### (Optional) Generate a config file

The easiest way to customize `life-server` is by running the `init` wizard.
This will create a `config.dev.js` in your current folder:

```
./bin/server init
```

## Usage

To run your server:

```
./bin/server start
```

After startup, the server is available at the configured server URL (by default,
`https://localhost:7070`).

## Usage with Docker

See [docs/Usage With Docker](docs/usage-docker.md) for details.

## Security

TBD

Note: This is an experimental research server, not for production use.

## Contribute

Life Server is only possible because of a large community of 
[Solid contributors](https://github.com/solid/node-solid-server/blob/master/CONTRIBUTORS.md).
A heartfelt thank you to everyone for all of your efforts!

## License

[The MIT License](LICENSE.md)
