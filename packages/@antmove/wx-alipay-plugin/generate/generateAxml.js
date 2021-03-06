const propsHandle = require('../props/index.js');
const proccessComponentProps = require('../component/props');
const createComponentNode = require('../component/processRelations');
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const indentWidthChar = '  ';
const config = require('../config');
const {
    cjsToes,
    processMixTemplate
} = require('../../utils');
const wxsApp = require('./generateWxsDep');
/**
* process wxs
*/
function processImportJs (code) {
    return cjsToes(code);
}

/**
 * @special tags
 */
function createElement (tagName, children = []) {
    return {
        typeof: 'wxml.element',
        key: null,
        props: {},
        type: tagName,
        children
    };
}
function processSpecialTags (ast = {}) {
    if (ast.type === 'picker' && ast.children[0] && ast.children[0].length > 1) {
        ast.children[0] = [createElement('view', ast.children[0])];
        return ast;
    }
}

global.appNodesTreeStr = `module.exports = {\n`;

module.exports = function axmlRender (ast = [], fileInfo) {
    /**
     * container node render
     */
    fileInfo.nodeId = 0;
    let refRender = createComponentNode(ast[0], fileInfo);
    processComponentIs(fileInfo);
    processPageTpl(fileInfo);
    if (typeof ast === 'string') return ast;
    let _code = '';
    let indentWidth = '';

    ast.forEach(function (tagAst) {
        _code += renderFn(tagAst, fileInfo, refRender);
    });

    if (fileInfo.isPage) {
        /**
         * page
         */
        _code = `<view class='${config.options.pageContainerClassName}'>
                ${_code}
            </view>`;
    }

    generateRenderFn(fileInfo, refRender.toJsFile());
    return _code;

    function incIndent () {
        indentWidth += indentWidthChar;
    }

    function decIndent () {
        indentWidth = indentWidth.slice(0, -1 * indentWidthChar.length);
    }


    function renderFn (_ast, _fileInfo, parentRenderNode) {
        let _parentRenderNode = parentRenderNode;
        _ast.children = _ast.children || [];
        if (!config.hasWxs) {
            let bool = processSjs(_ast, _fileInfo);

            if (bool) return '';
        }
        if (_ast.type === 'wxs' && _ast.children.length) {
            try {
                let filename = _fileInfo.dist;
                let sjsCode = _ast.children[0].value;
                let moduleName = _ast.props.module.value[0] + '.sjs';

                filename =filename + moduleName;
                fs.outputFileSync(filename, processImportJs(sjsCode));
                _ast.children[0].value = '';
                let relativePath = filename.split(path.sep);
                let _relativePath = relativePath[relativePath.length - 1];
    
                _ast.props.src = { type: 'double', value: [ './' + _relativePath ] };

                
            } catch (e) {
                if (e) {
                    console.error(e);
                }
            }
        }
        let {props} = _ast;

        let isComponentRender = proccessComponentProps(_ast, _fileInfo, axmlRender);

        if (isComponentRender) {
            _parentRenderNode = createComponentNode(_ast, _fileInfo);
            parentRenderNode.appendChild(_parentRenderNode);
        }
        processSpecialTags(_ast);
        if (_ast.type === 'textContent') {
            // todo: fix comment parse bug
            if (_ast.value.match(/-->/)) {
                return '';
            }

            return `${_ast.value}`;
        }
        
        if (_ast.type === 'open-data') {
            console.warn('支付宝暂不支持open-data组件,请检查业务逻辑')
        }
        let code = '';
        let tagName = _ast.type;
        let children = _ast.children;

        appendCode(`<${tagName}`);
        props = props || {};

        let attrCode = '';
        Object.keys(props)
            .forEach(function (prop) {
                let propInfo = propsHandle(prop, props[prop], ast);

                // a:for process
                if (propInfo.key === 'wx:for-items' || propInfo.key === 'a:for-items') {
                    propInfo.key = 'a:for';
                }

                if (propInfo.value === null) {
                // 无值属性
                    attrCode += ` ${propInfo.key}`;
                } else {
                    let value = propInfo.value.value[0] || '';
                    value = value.replace(/\.wxml/g, '.axml')
                        .replace(/\.wxs/g, '.sjs');

                    /**
                 * support unknown type string
                 * */
                    if (propInfo.value && propInfo.value.type === 'unknown') {
                        let singleIndex = value.indexOf("'");
                        let doubleIndex = value.indexOf('"');

                        singleIndex = singleIndex > -1 ? singleIndex : 0;
                        doubleIndex = doubleIndex > -1 ? doubleIndex : 0;

                        if (singleIndex > doubleIndex) {
                            propInfo.value.type = 'double';
                        } else {
                            propInfo.value.type = 'single';
                        }
                    }

                    if (propInfo.value && propInfo.value.type === 'double') {
                        if (propInfo.key === 'wx:else' || propInfo.key === 'a:else') {
                            attrCode += ` ${propInfo.key} `;
                        } else {
                            attrCode += ` ${propInfo.key}="${value}"`;
                        }                      
                    } else {
                        if ((propInfo.key === "a:key" || propInfo.key === "wx:key") && !/{{/.test(value)) {
                            attrCode +=  ` ${propInfo.key}='{{${value}}}'`
                        } else {
                            attrCode += ` ${propInfo.key}='${value}'`;
                        }
                    }
                }
            });
        /**
         * close element
         */
        if (children.length === 0) {
            appendCode(`${attrCode}>`);
            // decIndent()
        } else {
            appendCode(`${attrCode}>`);
            incIndent();

            // children element
            if (Array.isArray(children)) {

                children.forEach(function (child) {
                    if (Array.isArray(child)) {
                        child.forEach(function (subChild) {
                            appendCode(renderFn(subChild, _fileInfo, _parentRenderNode));
                        });
                    } else {
                        appendCode(renderFn(child, _fileInfo, _parentRenderNode));
                    }
                });
            } else {
                appendCode(children);
            }

            decIndent();
        }
        appendCode(`</${tagName}>`);

        return code.replace(os.EOL + os.EOL, os.EOL);

        function appendCode (appendChars) {
            let isType = processMixTemplate('alipay', _ast);
            if (!isType) return
            if (appendChars.trim().length === 0) {
                return;
            }

            // if (appendChars.startsWith('<')) {
            //     code += (appendChars.startsWith('</') ? os.EOL : '') +  String(indentWidth) + appendChars;
            // } else if (appendChars.endsWith('>')) {
            //     code += appendChars + os.EOL;
            // } else {
            //     code += indentWidth + appendChars;
            // }
            if (appendChars.startsWith('<')) {
                code += (appendChars.startsWith('</') && !/<\/text>/.test(appendChars) ? os.EOL : '') +  String(indentWidth) + appendChars;
            } else if (appendChars.endsWith('>')) {
                if (/<\/text>/.test(appendChars)) {
                    code += appendChars 
                } else {
                    code += appendChars + os.EOL;
                }
            } else {
                code += indentWidth + appendChars;
            }
        }
    }
};

function processPageTpl (fileInfo = {}) {
    let bool = undefined;
    let jsonFile = fileInfo.dirname + '/' + fileInfo.basename + '.json';
    if (fs.pathExistsSync(jsonFile)) {
        let obj = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        if (obj.component === undefined) {
            fileInfo.isPage = true;
            fileInfo.isComponent = false;
        } else {
            fileInfo.isComponent = true;
        }
    }

    return bool;
}

/**
 * 组件层级关系
 */
function generateRenderFn (fileInfo, renderStr = '') {
    let route = fileInfo.dist.replace(fileInfo.output, '');
    route = route.replace(/\.axml/, '');
    route = route.replace(/\\+/g, '/');
    
    appNodesTreeStr += `'${route}': ${renderStr},`;
}

/**
 * sjs exports to props object
 */
function processSjs (_ast, _fileInfo) {
    let route = _fileInfo.dist.replace(_fileInfo.output, '');
    route = route.replace(/\.axml/, '');
    route = route.replace(/\\+/g, '/');
    let bool = false;
    if (_ast.type === 'wxs') {
        if (_ast.children.length) {
            /**
             * 内联 wxs 处理
             */
            try {
                let filename = _fileInfo.dist;
                let sjsCode = _ast.children[0].value;
                let moduleName = _ast.props.module.value[0];
                filename = filename.replace('.axml', '.');
                let wxsPath = filename;
                wxsPath = wxsPath.replace(_fileInfo.output, '');

                wxsPath = wxsPath + moduleName + 'sjs.js';

                if (sjsCode.match(/\s*getRegExp/g)) {
                    let preCode = `
                    function getRegExp (p1, p2) {
                        return new RegExp(p1, p2);
                    }
                    \n
                    `;
                    sjsCode = preCode + sjsCode;
                }

                fs.outputFileSync(filename + moduleName + 'sjs.js', sjsCode);
                _ast.children[0].value = '';

                
                wxsApp.createDep(route, wxsPath, moduleName, _fileInfo.output);
                
                // _ast.props.src = { type: 'double', value: [ './' + _relativePath ] };
                bool = true;
            } catch (e) {
                if (e) {
                    console.error(e);
                }
            }
        } else {
            let filename = _fileInfo.dist;
            let moduleName = _ast.props.module.value[0];
            let wxsPath = _ast.props.src.value[0] + '.js';
            wxsPath = path.join(filename, '../', wxsPath);
            wxsPath = wxsPath.replace(_fileInfo.output, '');

            if (wxsPath[0] !== '/') {
                wxsPath = '/' + wxsPath;
            }
            wxsApp.createDep(route, wxsPath, moduleName, _fileInfo.output);
            bool = true;
        }
    }

    return bool;
}

function processComponentIs (fileInfo) {
    // let dist = fileInfo.dist.replace(/\.axml$/, '.is.js');
    let isPath = fileInfo.dist.replace(fileInfo.output, '')
        .replace(/\.axml$/, '').replace(/\\/g, "/");
    
    if (fileInfo.parent) {
        fileInfo.parent.is = isPath;
    }

}