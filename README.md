# Solid Lite Server _(solid-lite-server)_

> A decentralized personal data server inspired by [Solid](https://solid.mit.edu)

## Table of Contents

- [Security](#security)
- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#license)

## Security

TBD

## Background

`solid-lite-server` is a personal data server, originally based on MIT's
[`solid-server`](https://github.com/solid/node-solid-server).

The focus of this project is on simplifying the developer experience, providing
more data access API options than just LDP, as well as on rapid feature
iteration ("move fast and break things").

## Install

### Pre-requisites: Node.js v10

* Linux or Mac OS X
* Node 10
* [Optional] OpenSSL (for certificate generation)

**Operating System:** Linux and Mac OS X. Windows is currently not supported
for this project.

To run the Solid Lite server, you will first need to install Node.js version
10 or higher. (The developers recommend using
[`nvm`](https://github.com/creationix/nvm) to install Node.)

(Optional) If you intend to create a self-signed certificate (for local testing),
you will also need OpenSSL.

### Install `solid-lite-server` from Github

```bash
git clone https://github.com/dmitrizagidulin/solid-lite-server.git
cd solid-lite-server
git checkout develop
```

### Prepare the SSL certificate

**Local/Development:** Installing the server for local development and testing
will require an SSL certificate. You can generate a self-signed certificate
yourself (see [Generating a self-signed SSL certificate](docs/ssl-certificates.md)
in `docs/`), but remember to launch the server using `./bin/solid-test` rather
than `./bin/solid`.

**Production:** Installing `solid-lite-server` in a production environment will
require a valid SSL certificate (self-signed certs will not work). In addition,
if you're running the server in Multi User mode, you will need a
[Wildcard Certificate](https://en.wikipedia.org/wiki/Wildcard_certificate).

### Edit `/etc/hosts` (development/testing only)

To run the account creation on unit tests, `solid-lite-server`'s test suite
uses the following localhost domains: `nic.localhost`, `tim.localhost`, and
`nicola.localhost`. You will need to create host file entries for these, in
order for the tests to pass.

Edit your `/etc/hosts` file, and append:

```
# Used for unit testing solid-lite
127.0.0.1 nic.localhost
127.0.0.1 tim.localhost
127.0.0.1 nicola.localhost
```

### Generate a config file

The easiest way to setup `solid-lite-server` is by running the `init` wizard.
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

## Contribute

TBD

## License

[MIT](LICENSE)
