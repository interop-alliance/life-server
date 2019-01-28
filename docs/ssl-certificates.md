# SSL Certificates

## Generating a self-signed SSL certificate

When deploying `life-server` in production, we recommend that you go
the usual Certificate Authority route (or use
[Let's Encrypt!](https://letsencrypt.org/getting-started/)) to generate your SSL
certificate (as you would with any website that supports HTTPS). However, for
testing it locally, you can easily generate a self-signed certificate for whatever
domain you're working with.

```
$ openssl req -outform PEM -keyform PEM -new -x509 -sha256 -newkey rsa:2048 -nodes -keyout ../privkey.pem -days 365 -out ../fullchain.pem
```

Note that this example creates the `fullchain.pem` and `privkey.pem` files
in a directory one level higher from the current, so that you don't
accidentally commit your certificates to Git while you're developing.

If you would like to get rid of the browser warnings, import your 
`fullchain.pem` certificate into your 'Trusted Root Certificate' store. 
