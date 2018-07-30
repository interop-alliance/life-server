# SSL Certificates

## Generating a self-signed SSL certificate

When deploying `life-server` in production, we recommend that you go
the usual Certificate Authority route (or use
[Let's Encrypt!](https://letsencrypt.org/getting-started/)) to generate your SSL
certificate (as you would with any website that supports HTTPS). However, for
testing it locally, you can easily generate a self-signed certificate for whatever
domain you're working with.

```
$ openssl genrsa 2048 > ../localhost.key
$ openssl req -new -x509 -nodes -sha256 -days 3650 -key ../localhost.key -subj '/CN=*.localhost' > ../localhost.cert
```

Note that this example creates the `localhost.cert` and `localhost.key` files
in a directory one level higher from the current, so that you don't
accidentally commit your certificates to Git while you're developing.
