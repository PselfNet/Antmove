const generateAxml = require('../../generate/generateAxml.js');
const { precessRelativePathOfCode } = require('../../../utils');
const fs = require('fs-extra');

module.exports = function (fileInfo, ctx, isComponent = false) {
    fileInfo.dist = fileInfo.dist.replace(/\.wxml/, '.axml');
    let originCode = generateAxml(fileInfo.ast, fileInfo);
    originCode = precessRelativePathOfCode(originCode, fileInfo.path, ctx.entry, isComponent);
    fs.outputFileSync(fileInfo.dist, originCode);
};
