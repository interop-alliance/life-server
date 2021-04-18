# History

## 8.0.0 - TBD

### Added
- Added feature flags, exposed on the `SolidHost` object as `host.features`.
- Added optional DID provisioning and CHAPI wallet registration on signup.
- All tests now pass on Windows 10!

### Changed
- **BREAKING**: Refactored configuration system. Config file is now
  a `.js` file (to enable comments, etc), and not JSON. Default config file
  is now `config.dev.js` instead of `config.json`.
- Updated `commander`, `node-mailer` and `inquirer` packages to latest versions.
- **BREAKING**: Account recover email is now loaded from `storage.users` db,
  instead of from the account root `.acl` file.
- **BREAKING**: Default port is now `7070`.
- **BREAKING**: Enable sameSite 'None' for CHAPI wallet requests.

## 7.0.0 - 2020-02-15

### Changed
- Fixed display server welcome page in single-user mode.
- Fixed/updated Dockerfile (to enable [Life Server to be hosted on 
  PermanentCloud](https://permanent.cloud/apps/life-server))
- Do not init 'welcome page' on startup in single user mode, implement a
  `ServerWelcomeRequest` handler instead.
- Refactor `OidcManager` to use flex-docstore.
- **BREAKING**: Refactor OIDC provider config to load from flex-docstore.
- Fix Share request (adding and removing permissions to resource).

### Upgrade notes from 6.x
The main thing that has changed is the location of where the OpenID Connect 
issuer's config file is stored. We recommend that you clear the `db` directory
(by running `npm run reset`) and restart the server (this will re-initialize the 
config file in the new location).

## 6.0.2 - 2019-11-17

### Changed
- Start server in http mode if certs are not passed in.

## 6.0.1 - 2019-11-14

### Changed
- (Potentially a breaking change from 6.0.0) Replace user credential store 
  backend with flex-docstore.
- Simplify startup (no customizable template creation).

## 6.0.0 - 2019-11-01

- Extensive refactoring and paring down of features. Rearranged project
    directory structure.
- Simplify architecture, remove a number of non-core components (globbing,
    realtime updates via WebSockets, WebID-TLS local authentication, CORS proxy
    and authentication proxy, storage quotas).
- Refactor the LDP interface to more closely match the [proposed Solid 
    architecture](https://github.com/solid/solid-architecture/blob/master/server/request-flow.md),
    and to support modular/pluggable storage backends beyond the existing File 
    System based one (such as an in-memory store, graph stores and others).
- Bring some external authn-related dependencies (such as the 
    [`oidc-auth-manager`](https://github.com/solid/oidc-auth-manager) and the 
    [`solid-multi-rp-client`](https://github.com/solid/solid-multi-rp-client))
    libs into this repository (to make for a faster release and refactoring
    process).
- Replace logging layer (previously a mix of `console` and `debug`) with a
    dedicated logger (Pino).
- Update most dependencies to latest
- Shorten the WebID Profile URL template for new accounts from
  `/profile/card#me` to `/web#id`
- Refactor ACL system to use a new version of `interop-alliance/solid-permissions`
- Update non-test code to use ES7 `async`/`await` syntax.
- Update style to Standard.js v14

### Upgrading from `node-solid-server` 4.x or 5.x

Not supported. This is a major refactoring, many breaking changes.

## 5.0.0 - Sort of

- Forked from `solid/node-solid-server` and into `interop-alliance/life-server`
    starting with NSS v4.0.14
- Pulled in some things from NSS 5.0 (like the Delete Account feature)

## 4.0.0
- OIDC is now supported as authentication method in addition to WebID-TLS.
- Both Node.js 6 and 8 are now supported.
- The server now accepts N3 patches.
- Responses now contain a WAC-Allow header, listing the access permissions
  for the current user and non-authenticated users.
- The `authProxy` configuration parameter has been added,
  enabling back-end servers to serve authenticated content.
  It accepts an object of path/server pairs
  (such as `/my/path": "http://localhost:2345/app"`).
  The Solid server acts as a reverse proxy for these paths, forwarding requests
  to the back-end server along with the authenticated user (`User` header)
  and the host through which Solid is being accessed (`Forwarded` header).
- The `acceptCertificateHeader` configuration parameter has been added.
  This allows WebID-TLS authentication behind a reverse proxy such as NGINX:
  the reverse proxy should be configured to pass the client certificate
  in a certain header, which is then read by a (non-public) Solid server.
- Self-signed certificates are no longer trusted in production.
  To allow self-signed certificates (for testing purposes), use `bin/solid-test`,
  which sets `NODE_TLS_REJECT_UNAUTHORIZED=0` and `--no-reject-unauthorized`.
- On POST requests, an extension will be appended to the file.
- Server logging is now more concise.
- Express server injection is now supported
- The root route (e.g. `/`) now displays a public home page.
- Several other bugfixes

#### 4.0.0 Upgrade Notes
- The `proxy` configuration parameter has been deprecated and
  renamed to `corsProxy` to better distinguish it from `authProxy`.
- The `idp` configuration parameter has been deprecated and
  renamed to `multiuser` to better identify its purpose.
- Cross-domain cookie-based authentication has been removed for security reasons.
  We instead recommend https://github.com/solid/solid-auth-client.
- Clients should not include an extension in the slug of POST requests
  (they never should have), as the server now adds an extension.

## 3.5.0 and earlier
See [`node-solid-server` (NSS) Changelog](https://github.com/solid/node-solid-server/blob/master/CHANGELOG.md)
