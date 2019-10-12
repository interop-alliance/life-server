const ResourceMapper = require('../../lib/data-storage/resource-mapper')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

const rootUrl = 'http://localhost/'
const rootPath = '/var/www/folder/'

const itMapsUrl = asserter(mapsUrl)
const itMapsFile = asserter(mapsFile)

describe('ResourceMapper', () => {
  describe('A ResourceMapper instance for a single-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl, rootPath })

    // PUT base cases from https://www.w3.org/DesignIssues/HTTPFilenameMapping.html

    itMapsUrl(mapper, 'a URL with an extension that matches the content type',
      {
        url: 'http://localhost/space/foo.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, "a URL with a bogus extension that doesn't match the content type",
      {
        url: 'http://localhost/space/foo.bar',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.bar$.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, "a URL with a real extension that doesn't match the content type",
      {
        url: 'http://localhost/space/foo.exe',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.exe$.html`,
        contentType: 'text/html'
      })

    // Additional PUT cases

    itMapsUrl(mapper, 'a URL without content type',
      {
        url: 'http://localhost/space/foo.html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html$.unknown`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL with an alternative extension that matches the content type',
      {
        url: 'http://localhost/space/foo.jpeg',
        contentType: 'image/jpeg',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.jpeg`,
        contentType: 'image/jpeg'
      })

    itMapsUrl(mapper, 'a URL with an uppercase extension that matches the content type',
      {
        url: 'http://localhost/space/foo.JPG',
        contentType: 'image/jpeg',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.JPG`,
        contentType: 'image/jpeg'
      })

    itMapsUrl(mapper, 'a URL with a mixed-case extension that matches the content type',
      {
        url: 'http://localhost/space/foo.jPeG',
        contentType: 'image/jpeg',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.jPeG`,
        contentType: 'image/jpeg'
      })

    // GET/HEAD/POST/DELETE/PATCH base cases

    itMapsUrl(mapper, 'a URL of a non-existing file',
      {
        url: 'http://localhost/space/foo.html'
      },
      [/* no files */],
      new Error('File not found'))

    itMapsUrl(mapper, 'a URL of an existing file with extension',
      {
        url: 'http://localhost/space/foo.html'
      },
      [
        `${rootPath}space/foo.html`
      ],
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'an extensionless URL of an existing file',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.html`
      ],
      {
        path: `${rootPath}space/foo$.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'an extensionless URL of an existing file, with multiple choices',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.html`,
        `${rootPath}space/foo$.ttl`,
        `${rootPath}space/foo$.png`
      ],
      {
        path: `${rootPath}space/foo$.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'an extensionless URL of an existing file with an uppercase extension',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.HTML`
      ],
      {
        path: `${rootPath}space/foo$.HTML`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'an extensionless URL of an existing file with a mixed-case extension',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.HtMl`
      ],
      {
        path: `${rootPath}space/foo$.HtMl`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL of an existing file with encoded characters',
      {
        url: 'http://localhost/space/foo%20bar%20bar.html'
      },
      [
        `${rootPath}space/foo bar bar.html`
      ],
      {
        path: `${rootPath}space/foo bar bar.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL of a new file with encoded characters',
      {
        url: 'http://localhost/space%2Ffoo%20bar%20bar.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo bar bar.html`,
        contentType: 'text/html'
      })

    // Security cases

    itMapsUrl(mapper, 'a URL with an unknown content type',
      {
        url: 'http://localhost/space/foo.html',
        contentTypes: ['text/unknown'],
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html$.unknown`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL with a /.. path segment',
      {
        url: 'http://localhost/space/../bar'
      },
      new Error('Disallowed /.. segment in URL'))

    itMapsUrl(mapper, 'a URL with an encoded /.. path segment',
      {
        url: 'http://localhost/space%2F..%2Fbar'
      },
      new Error('Disallowed /.. segment in URL'))

    // File to URL mapping

    itMapsFile(mapper, 'an HTML file',
      { path: `${rootPath}space/foo.html` },
      {
        url: 'http://localhost/space/foo.html',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a Turtle file',
      { path: `${rootPath}space/foo.ttl` },
      {
        url: 'http://localhost/space/foo.ttl',
        contentType: 'text/turtle'
      })

    itMapsFile(mapper, 'an unknown file type',
      { path: `${rootPath}space/foo.bar` },
      {
        url: 'http://localhost/space/foo.bar',
        contentType: 'application/octet-stream'
      })

    itMapsFile(mapper, 'a file with an uppercase extension',
      { path: `${rootPath}space/foo.HTML` },
      {
        url: 'http://localhost/space/foo.HTML',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file with a mixed-case extension',
      { path: `${rootPath}space/foo.HtMl` },
      {
        url: 'http://localhost/space/foo.HtMl',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'an extensionless HTML file',
      { path: `${rootPath}space/foo$.html` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'an extensionless Turtle file',
      { path: `${rootPath}space/foo$.ttl` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/turtle'
      })

    itMapsFile(mapper, 'an extensionless unknown file type',
      { path: `${rootPath}space/foo$.bar` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'application/octet-stream'
      })

    itMapsFile(mapper, 'an extensionless file with an uppercase extension',
      { path: `${rootPath}space/foo$.HTML` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'an extensionless file with a mixed-case extension',
      { path: `${rootPath}space/foo$.HtMl` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file with disallowed IRI characters',
      { path: `${rootPath}space/foo bar bar.html` },
      {
        url: 'http://localhost/space/foo%20bar%20bar.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for a multi-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl, rootPath, includeHost: true })

    itMapsUrl(mapper, 'a URL with a host',
      {
        url: 'http://example.org/space/foo.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}example.org/space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL with a host with a port',
      {
        url: 'http://example.org:3000/space/foo.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}example.org/space/foo.html`,
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file on a host',
      {
        path: `${rootPath}space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://example.org/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for a multi-host setup with a subfolder root URL', () => {
    const rootUrl = 'https://localhost/foo/bar/'
    const mapper = new ResourceMapper({ rootUrl, rootPath, includeHost: true })

    itMapsFile(mapper, 'a file on a host',
      {
        path: `${rootPath}space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'https://example.org/foo/bar/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTP host with non-default port', () => {
    const mapper = new ResourceMapper({ rootUrl: 'http://localhost:81/', rootPath })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}space/foo.html`
      },
      {
        url: 'http://localhost:81/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTP host with non-default port in a multi-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl: 'http://localhost:81/', rootPath, includeHost: true })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://example.org:81/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTPS host with non-default port', () => {
    const mapper = new ResourceMapper({ rootUrl: 'https://localhost:81/', rootPath })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}space/foo.html`
      },
      {
        url: 'https://localhost:81/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTPS host with non-default port in a multi-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl: 'https://localhost:81/', rootPath, includeHost: true })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'https://example.org:81/space/foo.html',
        contentType: 'text/html'
      })
  })
})

function asserter (assert) {
  const f = (...args) => assert(it, ...args)
  f.skip = (...args) => assert(it.skip, ...args)
  f.only = (...args) => assert(it.only, ...args)
  return f
}

function mapsUrl (it, mapper, label, options, files, expected) {
  // Shift parameters if necessary
  if (!expected) {
    expected = files
    files = []
  }

  // Mock filesystem
  function mockReaddir () {
    mapper._readdir = async (path) => {
      expect(path).to.equal(`${rootPath}space/`)
      return files.map(f => f.replace(/.*\//, ''))
    }
  }

  // Set up positive test
  if (!(expected instanceof Error)) {
    it(`maps ${label}`, async () => {
      mockReaddir()
      const actual = await mapper.mapUrlToFile(options)
      expect(actual).to.deep.equal(expected)
    })
  // Set up error test
  } else {
    it(`does not map ${label}`, async () => {
      mockReaddir()
      const actual = mapper.mapUrlToFile(options)
      await expect(actual).to.be.rejectedWith(expected.message)
    })
  }
}

function mapsFile (it, mapper, label, options, expected) {
  it(`maps ${label}`, async () => {
    const actual = await mapper.mapFileToUrl(options)
    expect(actual).to.deep.equal(expected)
  })
}
