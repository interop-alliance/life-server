/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

var file = require('../fileStore.js');
var header = require('../header.js');
var options = require('../options.js');
var logging = require('../logging.js');

function handler(req, res) {
    logging.log("PUT -- Request path: " + req.path);
    logging.log("PUT -- Text length: " + (req.text ? req.text.length : 'undefined'));
    res.header('MS-Author-Via' , 'SPARQL' );

    var filename = file.uriToFilename(req.path);

    // PUT requests not supported on containers. Use POST instead
    if (S(filename).endsWith('/')) {
        return res.status(409).send("PUT to containers not supported. Use POST method instead");
    }

    var ct1 = req.get('content-type');
    var ct2 = mime.lookup(filename);

    if (ct1 && ct2 && (ct1 !== ct2)) {
        return res.status(415).send("Content type mismatch with path file.extenstion");
    }
    if (!ct2) {
        return res.status(415).send("Sorry, Filename must have extension for content type");
    }

    createDir();

    function createDir() {
        var directory = path.dirname(filename);
        fs.exists(directory, function(exists) {
            if (exists) {
                writeFile(null);
            } else {
                fse.mkdirp(directory, writeFile);
            }
        });
    }

    function writeFile(mkdirErr) {
        if (mkdirErr) {
            logging.log("PUT -- Error creating directory: " + mkdirErr);
            return res.status(500).send("Can't create directory");
        }
        fs.writeFile(filename, req.text,  function(err) {
            if (err) {
                logging.log("PUT -- Write error: " + err);
                return res.status(500).send("Can't write file: "+ err);
            } else {
                logging.log("PUT -- Write Ok. Bytes written: " + req.text.length);
                return res.sendStatus(201);
            }
        }); // file write
    }
}

exports.handler = handler;