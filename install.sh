sh download-core.sh 1.22.0
node scrape-examples.js > examples.json
cp -r node_modules/h5p-editor/src/client h5p/editor/wp