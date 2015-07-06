/*jslint node: true*/
"use strict";

var _ = require('underscore');
var mime = require('mime');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

var header = require('../header.js');
var metadata = require('../metadata.js');
var options = require('../options.js');
var logging = require('../logging.js');
var file = require('../fileStore.js');
var subscription = require('../subscription.js');

var ldpVocab = require('../vocab/ldp.js');
var aclExtension = '.acl';
var metaExtension = '.meta';

function get(req, res, includeBody) {
    // Add request to subscription service
    if (('' + req.path).slice(-options.changesSuffix.length) ===
        options.changesSuffix) {
        logging.log("Subscribed to ", req.path);
        return subscription.subscribeToChanges(req, res);
    }
    // Set headers
    res.header('MS-Author-Via', 'SPARQL');
    if (options.live) {
        // Note not yet in
        // http://www.iana.org/assignments/link-relations/link-relations.xhtml
        header.addLink(res, req.path + options.changesSuffix, 'changes');
        // res.header('Link' , '' + req.path + options.SSESuffix + ' ; rel=events' );
        // overwrites the pevious
        res.header('Updates-Via', '' + req.path + options.changesSuffix);
    }

    if (includeBody) {
        logging.log('GET -- ' + req.path);
    } else {
        logging.log('HEAD -- ' + req.path);
    }

    var filename = file.uriToFilename(req.path);
    fs.stat(filename, function(err, stats) {
        if (err) {
            if (glob.hasMagic(filename)) {
                logging.log("GET/HEAD -- Glob request");
                globHandler();
            } else {
                logging.log('GET/HEAD -- Read error: ' + err);
                return res.status(404).send("Can't read file: " + err);
            }
        } else if (stats.isDirectory()) {
            if (includeBody) {
                metadata.readContainerMetadata(filename, containerHandler);
            } else {
                res.status(200).send();
                res.end();
            }
        } else {
            if (includeBody)
                fs.readFile(filename, {
                    encoding: "utf8"
                }, fileHandler);
            else {
                res.status(200).send();
                res.end();
            }
        }
    });

    function fileHandler(err, data) {
        if (err) {
            logging.log('GET/HEAD -- Read error:' + err);
            res.status(404).send("Can't read file: " + err);
        } else {
            logging.log('GET/HEAD -- Read Ok. Bytes read: ' + data.length);
            var ct = mime.lookup(filename);
            res.set('content-type', ct);
            logging.log('GET/HEAD -- content-type: ' + ct);
            if (path.extname(filename) === aclExtension ||
                path.basename(filename) === aclExtension ||
                path.basename(filename) === metaExtension) {
                ct = 'text/turtle';
            }
            if (ct === 'text/turtle') {
                parseLinkedData(data);
            } else {
                res.status(200).send(data);
            }
        }
    }

    function containerHandler(err, rawContainer) {
        if (err) {
            logging.log("GET/HEAD -- Not a valid container");
            res.status(404).send("Not a container");
        } else {
            parseContainer(rawContainer);
        }
    }

    function globHandler() {
        glob(filename, globOptions, function(err, matches) {
            if(err || matches.length === 0) {
                logging.log("GET/HEAD -- No files matching the pattern");
                return res.sendStatus(404);
            } else {
                logging.log("matches " + matches);
                var globGraph = $rdf.graph();
                _.each(matches, function(match) {
                    try {
                        var fileData = fs.readFileSync(match,
                            {encoding: "utf8"});
                        var baseUri = file.filenameToBaseUri(match);
                        //TODO integrate ACL
                        if (S(match).endsWith(".ttl")) {
                            $rdf.parse(fileData, globGraph, baseUri,
                                'text/turtle');
                        }
                    } catch (readErr) {
                        return;
                    }
                });
                var turtleData = $rdf.serialize(undefined, globGraph,
                    null, 'text/turtle');
                parseLinkedData(turtleData);
            }
        });
    }

    function parseLinkedData(turtleData) {
        var accept = header.parseAcceptHeader(req);
        var baseUri = file.filenameToBaseUri(filename);

        // Handle Turtle Accept header
        if (accept === undefined || accept === null) {
            accept = 'text/turtle';
        }
        if (accept === 'text/turtle' || accept === 'text/n3' ||
            accept == 'application/turtle' || accept === 'application/n3') {
            return res.status(200)
                .set('content-type', accept)
                .send(turtleData);
        }

        //Handle other file types
        var resourceGraph = $rdf.graph();
        try {
            $rdf.parse(turtleData, resourceGraph, baseUri, 'text/turtle');
        } catch (err) {
            logging.log("GET/HEAD -- Error parsing data: " + err);
            return res.status(500).send(err);
        }

        //TODO rdflib callbacks
        $rdf.serialize(undefined, resourceGraph, null,
            accept, function(err, result) {
                if (result === undefined || err) {
                    logging.log("GET/HEAD -- Serialization error: " + err);
                    return res.sendStatus(500);
                } else {
                    res.set('content-type', accept);
                    return res.status(200).send(result);
                }
            });
    }

    function parseContainer(containerData) {
        //Handle other file types
        var baseUri = file.filenameToBaseUri(filename);
        var resourceGraph = $rdf.graph();
        try {
            $rdf.parse(containerData, resourceGraph, baseUri, 'text/turtle');
        } catch (err) {
            logging.log("GET/HEAD -- Error parsing data: " + err);
            return res.status(500).send(err);
        }
        logging.log("GET/HEAD -- Reading directory");
        fs.readdir(filename, readdirCallback);

        function readdirCallback(err, files) {
            if (err) {
                logging.log("GET/HEAD -- Error reading files: " + err);
                return res.sendStatus(404);
            } else {
                for (var i = 0; i < files.length; i++) {
                    if (!S(files[i]).startsWith('.')) {
                        try {
                            var stats = fs.statSync(filename + files[i]);
                            if (stats.isFile()) {
                                resourceGraph.add(resourceGraph.sym(baseUri),
                                    resourceGraph.sym(ldpVocab.contains),
                                    resourceGraph.sym(files[i]));
                            }
                        } catch (statErr) {
                            continue;
                        }
                    }
                }
                try {
                    var turtleData = $rdf.serialize(undefined, resourceGraph,
                        null, 'text/turtle');
                    parseLinkedData(turtleData);
                } catch (parseErr) {
                    logging.log("GET/HEAD -- Error serializing container: " + parseErr);
                    return res.sendStatus(500);
                }
            }
        }
    }
}

var globOptions = {noext: true, nobrace: true};

function getHandler(req, res) {
    get(req, res, true);
}

function headHandler(req, res) {
    get(req, res, false);
}

exports.handler = getHandler;
exports.headHandler = headHandler;