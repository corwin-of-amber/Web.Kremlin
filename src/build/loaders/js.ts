import assert from 'assert';
import path from 'path';   /* @kremlin.native */

import * as acorn from 'acorn';
import * as acornLoose from 'acorn-loose';
import * as acornWalk from 'acorn-walk';
import acornGlobals from 'acorn-globals';

import { CompilationUnit, TextSource } from '../bundle';
import { InEnvironment } from '../environment';
import { ModuleRef, SourceFile, NodeModule, ModuleDependency } from '../modules';


class AcornJSModule extends InEnvironment implements CompilationUnit {
    dir?: string
    text: string
    ast: acorn.Node
    directives: ProcessingDirective[]
    isLoose: boolean = false;

    contentType = 'js'

    imports: (AcornTypes.ImportDeclaration | AcornTypes.ImportExpression)[]
    requires: RequireInvocation[]
    exports: AcornTypes.ExportDeclaration[]
    sourcemap?: SourceMapping

    vars: {
        globals: Map<string, AcornTypes.Identifier[]>
        used: Set<string>
        generated: Set<string>
    }
    metas: AcornTypes.MetaProperty[]

    acornOptions = AcornJSModule.DEFAULT_ACORN_OPTIONS

    constructor(text: string, dir?: string) {
        super();
        this.text = text;
        this.dir = dir;
        var parsed = this.parse(text);
        this.ast = parsed.ast;
        this.directives = parsed.directives;
        this.sourcemap = parsed.sourcemap;
        this.isLoose = parsed.isLoose;
    }

    parse(text: string) {
        var opts: acorn.Options = {
                ...this.acornOptions,
                onComment: (isBlock, text, start, end) => {
                    directives.push(...this.parseDirectives(text, {start, end}));
                    if (!isBlock)
                        sourcemap ??= this.parseSourceMapping(text, {start, end});
                }
            },
            directives: ProcessingDirective[] = [],
            sourcemap: SourceMapping = undefined;

        try { var ast = acorn.parse(text, opts), isLoose = false; }
        catch (e) {
            ast = acornLoose.parse(text, opts);
            isLoose = true;
        }
        return {ast, directives, sourcemap, isLoose};
    }

    parseDirectives(text: string, at: {start: number, end: number}): ProcessingDirective[] {
        var mo = text.match(/@kremlin[. ](\w+)(:?\((.*?)\))?/);
        if (mo) return [{name: mo[1], arguments: mo[2] && mo[2].split(','), at}]
        else return [];
    }

    parseSourceMapping(text: string, at: {start: number, end: number}): SourceMapping {
        var mo = text.match(/^# sourceMappingURL=(.*)/);
        if (mo) return {url: mo[1], isEmbed: mo[1].startsWith('data:'), at};
        else return undefined;
    }

    extractImports() {
        this.imports = [];
        this.requires = [];
        this.exports = [];
        try {
            acornWalk.full(this.ast, (node) => {
                if      (this.isImport(node))   this.imports.push(node);
                else if (this.isRequire(node))  this.requires.push(node);
                else if (this.isExport(node))   this.exports.push(node);
            });
        }
        catch (e) { this.env.report.warn(null, e); }
    }

    extractVars() {
        this.vars = {
            globals: this._extractGlobals(),
            used: this._extractVarNames(),
            generated: new Set
        };
        this.metas = this._extractMetaProperties();
    }

    _extractGlobals() {
        assert(AcornUtils.is(this.ast, 'Program'));
        var prog = Object.assign({}, this.ast,   // strip imports so they don't count as locals
            {body: this.ast.body.filter(x => !this.isImport(x))});
        var globals = new Map;
        try {
            for (let {name, nodes} of acornGlobals(prog))
                globals.set(name, nodes);
        }
        catch (e) { this.env.report.warn(null, e); }
        return globals;
    }

    _extractMetaProperties() {
        var s: AcornTypes.MetaProperty[] = [];
        try {
            acornWalk.full(this.ast, u => {
                if (AcornUtils.is(u, "MetaProperty")) s.push(u);
            });
        }
        catch (e) { this.env.report.warn(null, e); }
        return s;
    }

    _extractVarNames() {
        var s: Set<string> = new Set;
        try {
            acornWalk.full(this.ast, u => {
                if (AcornUtils.is(u, "Identifier")) s.add(u.name);
            });
        }
        catch (e) { this.env.report.warn(null, e); }
        return s;
    }

    _getAssociatedDirectives(node: acorn.Node) {
        var at = {start: node.start, end: node.end};
        return this.directives.filter(d =>
            TextSource.areOnSameLine(this.text, at, d.at));
    }

    get exportsFrom() {
        return this.exports.filter(u => this.isExportFrom(u)) as
                (acorn.Node & {source?: AcornTypes.Literal})[];
    }

    isImport(node: acorn.Node): node is AcornTypes.ImportDeclaration | 
                                        AcornTypes.ImportExpression {
        return AcornUtils.is(node, 'ImportDeclaration') ||
               AcornUtils.is(node, 'ImportExpression');
    }

    isRequire(node: acorn.Node): node is RequireInvocation {
        const is = AcornUtils.is;
        return is(node, 'CallExpression') && 
               is(node.callee, 'Identifier') && node.callee.name === 'require' &&
               node.arguments.length == 1 && is(node.arguments[0], 'Literal');
    }

    isExport(node: acorn.Node): node is AcornTypes.ExportDeclaration {
        return AcornUtils.is(node, 'ExportNamedDeclaration') ||
               AcornUtils.is(node, 'ExportDefaultDeclaration') ||
               AcornUtils.is(node, 'ExportAllDeclaration');
    }

    isExportFrom(node: acorn.Node): node is AcornTypes.ExportNamedDeclaration {
        return (AcornUtils.is(node, 'ExportNamedDeclaration') ||
                AcornUtils.is(node, 'ExportAllDeclaration')) && !!node.source;
    }

    isExternalRef(node: acorn.Node) {
        return this._getAssociatedDirectives(node).some(d =>
            ['native', 'external'].includes(d.name));
    }

    _isShorthandProperty(node: AcornTypes.Identifier) {
        return node.parents.slice(-2).some(p =>
            AcornUtils.is(p, "Property") && p.shorthand);
    }

    process(key: string, deps: ModuleDependency<acorn.Node>[]) {
        if (!this.vars) this.extractVars();
        this.vars.generated.clear(); /* reset */

        var imports = this.imports.map(imp => {
                var dep = deps.find(d => d.source === imp);
                return dep ? this.processImport(imp, dep.target) : [];
            }),
            requires = this.requires.map(req => {
                var dep = deps.find(d => d.source === req);
                return dep ? this.processRequire(req, dep.target) : [];
            }),
            exports = this.exports.map(exp => {
                var dep = deps.find(d => d.source === exp);  // for `export .. from`
                return this.processExport(exp, dep && dep.target);
            }),
            sourcemap = this.sourcemap ? this.processSourceMap(this.sourcemap) : [],
            metas = this.metas.map(mp => [[mp, '__todo_metavar']]),

            prog = TextSource.interpolate(this.text, 
                [].concat(...imports, ...requires, ...exports, sourcemap, ...metas)
                .map(([node, text]) => ({...node, text})));

        prog = this.postprocess(prog);

        return `kremlin.m['${key}'] = function(module,exports,global) {${prog}};`;
    }

    processImport(imp: AcornTypes.ImportDeclaration | AcornTypes.ImportExpression, ref: ModuleRef):
            Subst<AcornTypes.ImportDeclaration | AcornTypes.ImportExpression | AcornTypes.Identifier>[] {
        return AcornUtils.is(imp, 'ImportDeclaration') ?
            this.processImportStmt(imp, ref) : this.processImportExpr(imp, ref);
    }

    processImportStmt(imp: AcornTypes.ImportDeclaration, ref: ModuleRef): Subst<AcornTypes.ImportDeclaration | AcornTypes.Identifier>[] {
        var lhs: string, refs: Subst<AcornTypes.Identifier>[] = [], isDefault = false;
        if (imp.specifiers.length == 1 && 
            (imp.specifiers[0].type === 'ImportDefaultSpecifier'
             || imp.specifiers[0].type === 'ImportNamespaceSpecifier')) {
            lhs = imp.specifiers[0].local.name;
            if (imp.specifiers[0].type === 'ImportDefaultSpecifier')
                isDefault = true;
        }
        else {
            lhs = this._freshVar();
            for (let impspec of imp.specifiers) {
                let local = impspec.local.name, 
                    imported = impspec.imported?.name || 'default';
                refs.push(...this.updateReferences(local, `${lhs}.${imported}`));
            }
        }
        return [[imp, `let ${lhs} = ${this.makeRequire(ref, isDefault)};`] as Subst<AcornTypes.ImportDeclaration | AcornTypes.Identifier>]
               .concat(refs);
    }

    processImportExpr(imp: AcornTypes.ImportExpression, ref: ModuleRef): Subst<AcornTypes.ImportExpression>[] {
        var isDefault = true; /** @todo */
        return [[imp, this.makeImportAsync(ref, isDefault)]];
    }

    processRequire(req: RequireInvocation, ref: ModuleRef): Subst<RequireInvocation>[] {
        return [[req, this.makeRequire(ref)]];
    }

    processExport(exp: AcornTypes.ExportDeclaration, ref: ModuleRef): Subst<Loc>[] {
        var locals: (string | [string, string])[] = [], rhs: string,
            is = AcornUtils.is, d = exp.declaration;

        if (is(exp, 'ExportNamedDeclaration')) {
            let isExportFrom = exp.source && ref;   // <- `export .. from`
            if (d) {  // <- `export const` etc.
                if (AcornUtils.is(d, 'FunctionDeclaration') ||
                    AcornUtils.is(d, 'ClassDeclaration'))
                    locals = [d.id.name];
                else if (AcornUtils.is(d, 'VariableDeclaration'))
                    locals = d.declarations.map(u => u.id.name);
                else {
                    console.warn('unrecognized declaration in `export`:', d);
                    locals = [];  /** @todo */
                }
            }
            else {
                for (let expspec of exp.specifiers) {
                    assert(expspec.type === 'ExportSpecifier');
                    let local = expspec.local.name, exported = expspec.exported.name;
                    /** @todo check if `local` is an imported identifier */
                    locals.push((local == exported) ? local :
                        isExportFrom ? [exported, local] : `${exported}:${local}`);
                }
            }

            rhs = isExportFrom
                    ? `${this.makeRequire(ref)}, ${JSON.stringify(locals)}`
                    : `{${locals}}`;

            if (d)
                return [[{start: exp.start, end: d.start}, ''],  // <- remove `export` modifier
                        [{start: exp.end, end: exp.end}, `\nkremlin.export(module, ${rhs});`]];
            else
                return [[exp, `kremlin.export(module, ${rhs});`]];
        }
        else if (is(exp, 'ExportAllDeclaration')) {  // <- `export * from`
            assert(!!exp.source);
            rhs = this.makeRequire(ref);
            return [[exp, `kremlin.export(module, ${rhs});`]];
        }
        else if (is(exp, 'ExportDefaultDeclaration')) {
            assert(d);
            // Careful incision
            return [[{start: exp.start,
                      end:   d.start},   'kremlin.export(module, {default:'],
                    [{start: d.end,
                      end:   exp.end},   '});']];
        }
        else throw new Error(`invalid export '${exp.type}'`);
    }

    processSourceMap(sourcemap: SourceMapping): Subst<Loc>[] {
        // currently, omit linked sourcemaps. keep embedded ones.
        /** @todo handle linked sourcemaps as asset deps. */
        return sourcemap.isEmbed ? [] : [[sourcemap.at, '']];
    }

    makeRequire(ref: ModuleRef, isDefault: boolean = false) {
        if (ref instanceof NodeModule) {
            return `require('${ref.name}')`;  /** @todo configure by target  */
        }
        else {
            var key = ref.normalize().canonicalName;
            return `kremlin.require('${key}', ${isDefault})`;
        }
    }

    makeImportAsync(ref: ModuleRef, isDefault: boolean = false) {
        assert(!(ref instanceof NodeModule));  /** @todo not supported */
        var key = ref.normalize().canonicalName;
        return `kremlin.import('${key}', ${isDefault})`;
    }

    updateReferences(name: string, expr: string): Subst<AcornTypes.Identifier>[] {
        var refs: Subst<AcornTypes.Identifier>[] = [];
        for (let refnode of this.vars.globals.get(name) || []) {
            var colon = this._isShorthandProperty(refnode);
            refs.push([refnode, 
                 `${colon ? name+':' : ''}${expr}`]);
        }
        return refs;
    }

    _freshVar(base = "") {
        if (!this.vars) this.extractVars();
        for (let i = 0; ; i++) {
            var nm = `${base}_${i}`;
            if (!this.vars.used.has(nm) && !this.vars.generated.has(nm)) {
                this.vars.generated.add(nm);
                return nm;
            }
        }
    }

    postprocess(prog: string) {
        // in case prog ends with single-line comment
        if (!prog.match(/\n\s+$/)) prog += '\n';
        // removes `#!`
        return prog.replace(/^#!.*/, '');
    }

    extractShebang() {
        var mo = this.text.match(/^#!.*/);
        return mo && mo[0];
    }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), path.dirname(m.filename));
    }

    /** @todo should probably be configurable somehow? */
    static DEFAULT_ACORN_OPTIONS: acorn.Options =
        {sourceType: 'module', ecmaVersion: 2022, allowHashBang: true};
}

type ProcessingDirective = {
    name: string
    arguments?: string[]
    at: {start: number, end: number}
};

type SourceMapping = {
    at: {start: number, end: number}
    url?: string
    isEmbed: boolean
};

type Loc = {start: number, end: number};

type Subst<T extends Loc = Loc> = [T, string]


declare class RequireInvocation extends AcornTypes.CallExpression {
    arguments: AcornTypes.Literal[]
}


declare namespace AcornTypes {

    class Program extends acorn.Node {
        body: acorn.Node[]
    }

    class ImportDeclaration extends acorn.Node {
        type: "ImportDeclaration"
        source: Literal
        specifiers: ImportSpecifier[]
    }

    class ImportSpecifier extends acorn.Node {
        type: "ImportSpecifier" | "ImportDefaultSpecifier" | "ImportNamespaceSpecifier"
        local: Identifier
        imported?: Identifier
    }

    class ImportExpression extends acorn.Node {
        type: "ImportExpression"
        source: Literal
    }

    class ExportDeclaration extends acorn.Node {
        type: "ExportNamedDeclaration" | "ExportDefaultDeclaration" | "ExportAllDeclaration"
        declaration?: acorn.Node
    }

    class ExportNamedDeclaration extends ExportDeclaration {
        type: "ExportNamedDeclaration"
        source?: Literal
        specifiers: ExportSpecifier[]
    }

    class ExportAllDeclaration extends ExportDeclaration {
        type: "ExportAllDeclaration"
        source?: Literal
    }

    class ExportDefaultDeclaration extends ExportDeclaration {
        type: "ExportDefaultDeclaration"
        declaration: acorn.Node   // not optional
    }

    class ExportSpecifier extends acorn.Node {
        local: Identifier
        exported: Identifier
    }

    class VariableDeclaration extends acorn.Node {
        type: "VariableDeclaration"
        kind: "var" | "const" | "let"
        declarations: VariableDeclarator[]
    }

    class VariableDeclarator extends acorn.Node {
        type: "VariableDeclarator"
        id: Identifier
        init?: acorn.Node
    }

    class FunctionDeclaration extends acorn.Node {
        type: "FunctionDeclaration"
        id: Identifier
        params: acorn.Node[]
        async: boolean
        expression: boolean
        generator: boolean
        body: acorn.Node
    }

    class ClassDeclaration extends acorn.Node {
        id: Identifier
        superClass: any
        body: acorn.Node
        locals: object
    }

    class CallExpression extends acorn.Node {
        type: "CallExpression"
        callee: acorn.Node
        arguments: acorn.Node[]
    }

    class Literal extends acorn.Node {
        value: string
    }

    class Identifier extends acorn.Node {
        name: string
        parents: acorn.Node[]  // actually this exists in for all acorn.Nodes :/
    }

    class Property extends acorn.Node {
        shorthand: boolean
    }

    class MetaProperty extends acorn.Node {
        type: "MetaProperty"
        meta: Identifier
        property: Identifier
    }

}

namespace AcornUtils {
    export function is(node: acorn.Node, type: "Program"): node is AcornTypes.Program
    export function is(node: acorn.Node, type: "ImportDeclaration"): node is AcornTypes.ImportDeclaration
    export function is(node: acorn.Node, type: "ImportSpecifier"): node is AcornTypes.ImportSpecifier
    export function is(node: acorn.Node, type: "ImportExpression"): node is AcornTypes.ImportExpression
    export function is(node: acorn.Node, type: "ExportNamedDeclaration"): node is AcornTypes.ExportNamedDeclaration
    export function is(node: acorn.Node, type: "ExportAllDeclaration"): node is AcornTypes.ExportAllDeclaration
    export function is(node: acorn.Node, type: "ExportDefaultDeclaration"): node is AcornTypes.ExportDefaultDeclaration
    export function is(node: acorn.Node, type: "CallExpression"): node is AcornTypes.CallExpression
    export function is(node: acorn.Node, type: "VariableDeclaration"): node is AcornTypes.VariableDeclaration
    export function is(node: acorn.Node, type: "VariableDeclarator"): node is AcornTypes.VariableDeclarator
    export function is(node: acorn.Node, type: "FunctionDeclaration"): node is AcornTypes.FunctionDeclaration
    export function is(node: acorn.Node, type: "ClassDeclaration"): node is AcornTypes.ClassDeclaration
    export function is(node: acorn.Node, type: "Identifier"): node is AcornTypes.Identifier
    export function is(node: acorn.Node, type: "Property"): node is AcornTypes.Property
    export function is(node: acorn.Node, type: "MetaProperty"): node is AcornTypes.MetaProperty
    export function is(node: acorn.Node, type: string): boolean

    export function is(node: acorn.Node, type: string) { return node.type === type; }
}


export { AcornJSModule }