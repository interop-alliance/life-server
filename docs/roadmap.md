# Development Roadmap

See also [CHANGELOG.md](../CHANGELOG.md) for package version details.

#### Roadmap Phase One (Complete)

This phase focused on general cleanup and refactoring from the source
`node-solid-server` v4 baseline.

* [x] Remove external dependency on Mashlib and the Data Browser. (The various
  built-in apps (account homepage, data viewing and file management, sharing
  and permission management, etc) will be performed on the server side.)
* [x] Simplify architecture, remove a number of non-core components (globbing,
  realtime updates via WebSockets, WebID-TLS local authentication, CORS proxy
  and authentication proxy, storage quotas, external WebIDs).
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
* [x] Simplify the new account templating system (do not create template and
  view copies for customizability)
* [x] Update `node-mailer` package to latest version
* [x] Update `inquirer` and `commander` packages to latest version
* [x] Make all tests pass on Windows 10
