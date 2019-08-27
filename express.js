const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const shortid = require('shortid');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const index = require('./index');

const H5PEditor = require('h5p-editor');
const H5PPlayer = require('h5p-player');

const examples = require('./examples.json');

const start = async () => {
    const h5pEditor = new H5PEditor.Editor(
        new H5PEditor.FileStorage(`${path.resolve()}/h5p`),
        {
            baseUrl: '/h5p',
            ajaxPath: '/ajax?action=',
            libraryUrl: '/h5p/editor/', // this is confusing as it loads no library but the editor-library files (needed for the ckeditor)
            filesPath: '/h5p/content'
        },
        new H5PEditor.InMemoryStorage(),
        await new H5PEditor.Config(new H5PEditor.JsonStorage(path.resolve('config.json'))).load(),
        new H5PEditor.LibraryManager(new H5PEditor.FileLibraryStorage(`${path.resolve('')}/h5p/libraries`)),
        new H5PEditor.User(),
        new H5PEditor.TranslationService(H5PEditor.englishStrings)
    );

    const server = express();

    server.use(bodyParser.json());
    server.use(
        bodyParser.urlencoded({
            extended: true
        })
    );
    server.use(
        fileUpload({
            limits: { fileSize: 50 * 1024 * 1024 }
        })
    );

    const h5pRoute = '/h5p';
    server.use(h5pRoute, express.static(`${path.resolve('')}/h5p`));

    server.use('/favicon.ico', express.static(`favicon.ico`));

    server.get('/', (req, res) => {
        fs.readdir(
            'h5p/content',
            (error, files) => {
                if (error) files = [];
                res.end(index({ contentIds: files, examples }));
            }
        );
    });

    server.get('/play', (req, res) => {
        if (!req.query.contentId) {
            return res.redirect('/');
        }

        let contentDir = `h5p/content/${req.query.contentId}`;

        const libraryLoader = (lib, maj, min) =>
            readJson(`./h5p/libraries/${lib}-${maj}.${min}/library.json`);

        Promise.all([
            readJson(`./${contentDir}/content/content.json`),
            readJson(`./${contentDir}/h5p.json`)
        ])
            .then(([contentObject, h5pObject]) =>
                new H5PPlayer.Player(libraryLoader)
                    .render(req.query.contentId, contentObject, h5pObject)
                    .then(h5p_page => res.end(h5p_page))
                    .catch(error => res.status(500).end(error.message)));
    });

    server.get('/examples/:key', (req, res) => {
        let key = req.params.key;
        let name = path.basename(examples[key].h5p);

        let dir = `${__dirname}/examples/${name}`;

        server.use('/h5p/libraries', express.static(dir));
        server.use(`/h5p/content/${name}`, express.static(`${dir}`));

        let first = Promise.resolve();
        if (!fs.existsSync(dir)) {
            first = exec(`sh download-example.sh ${examples[key].h5p}`);
        }

        const libraryLoader = (lib, maj, min) =>
            require(`./examples/${name}/${lib}-${maj}.${min}/library.json`);

        first
            .then(() => {
                const h5pObject = require(`${dir}/h5p.json`);
                const contentObject = require(`${dir}/content/content.json`);
                return new H5PPlayer.Player(libraryLoader).render(
                    name,
                    contentObject,
                    h5pObject
                );
            })
            .then(h5p_page => res.end(h5p_page))
            .catch(error => res.status(500).end(error.message));
    });

    server.get('/edit', (req, res) => {
        if (!req.query.contentId) {
            res.redirect(`?contentId=${shortid()}`);
        }
        h5pEditor.render(req.query.contentId)
            .then(page => res.end(page));
    });

    server.get('/params', (req, res) => {
        h5pEditor
            .loadH5P(req.query.contentId)
            .then(content => {
                res.status(200).json(content);
            })
            .catch(() => {
                res.status(404).end();
            });
    });

    server.get('/ajax', (req, res) => {
        const { action } = req.query;
        const { majorVersion, minorVersion, machineName, language } = req.query;

        switch (action) {
            case 'content-type-cache':
                h5pEditor.getContentTypeCache().then(contentTypeCache => {
                    res.status(200).json(contentTypeCache);
                });
                break;

            case 'libraries':
                h5pEditor
                    .getLibraryData(
                        machineName,
                        majorVersion,
                        minorVersion,
                        language
                    )
                    .then(library => {
                        res.status(200).json(library);
                    });
                break;

            default:
                res.status(400).end();
                break;
        }
    });

    server.post('/edit', (req, res) => {
        h5pEditor
            .saveH5P(
                req.query.contentId,
                req.body.params.params,
                req.body.params.metadata,
                req.body.library
            )
            .then(() => {
                res.status(200).end();
            });
    });

    server.post('/ajax', (req, res) => {
        const { action } = req.query;
        switch (action) {

            case 'libraries':
                h5pEditor.getLibraryOverview(req.body.libraries).then(libraries => {
                    res.status(200).json(libraries);
                });
                break;

            case 'files':
                h5pEditor
                    .saveContentFile(
                        req.body.contentId === '0'
                            ? req.query.contentId
                            : req.body.contentId,
                        JSON.parse(req.body.field),
                        req.files.file
                    )
                    .then(response => {
                        res.status(200).json(response);
                    });
                break;

            case 'library-install':
                h5pEditor.installLibrary(req.query.id)
                    .then(() => h5pEditor.getContentTypeCache()
                        .then(contentTypeCache => {
                            res.status(200).json({ success: true, data: contentTypeCache });
                        }))
                break;

            case 'library-upload':
                h5pEditor.uploadPackage(req.query.contentId, req.files.h5p.data)
                    .then(() => Promise.all([
                        h5pEditor.loadH5P(req.query.contentId),
                        h5pEditor.getContentTypeCache()
                    ])

                        .then(([content, contentTypes]) =>
                            res.status(200).json({
                                success: true,
                                data: {
                                    h5p: content.h5p,
                                    content: content.params.params,
                                    contentTypes
                                }
                            })))
                break;

            default:
                res.status(500).end('NOT IMPLEMENTED');
                break;
        }
    });

    server.listen(process.env.PORT || 8080, () => {
        console.log(`server running at http://localhost:${process.env.PORT || 8080}`);
    });
}

function readJson(file) {
    return new Promise((y, n) =>
        fs.readFile(file, 'utf8', (err, data) =>
            err ? n(err) : y(JSON.parse(data))))
}

start();