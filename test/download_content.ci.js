const { execSync } = require('child_process');
const examples = require('../examples.json');

examples.forEach((example, index) => {
    execSync(`sh download-and-extract-example.sh ${examples[index].h5p}`);
});
