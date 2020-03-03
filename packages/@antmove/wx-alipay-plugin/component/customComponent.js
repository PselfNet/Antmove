const { transformStr } = require('../../utils');

module.exports = function (ast) {
    ast.type = transformStr(ast.type);
};
