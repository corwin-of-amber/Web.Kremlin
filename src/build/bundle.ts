const fs = (0||require)('fs') as typeof import('fs'),   // use native fs
      path = (0||require)('path') as typeof import('path');
import assert from 'assert';

import * as acorn from 'acorn';
import * as acornWalk from 'acorn-walk';
import * as parse5 from 'parse5';
import parse5Walk from 'walk-parse5'
import acornGlobals from 'acorn-globals';
import { ModuleRef, SourceFile, PackageDir, TransientCode, NodeModule, ShimModule,
         StubModule, ModuleDependency, FileNotFound } from './modules';
import { Transpiler } from './transpile';
import { BuildCache } from './cache';
import { Report, ReportSilent } from './ui/report';



class SearchPath {
    dirs: string[]
    wdirs: string[]
    extensions: string[]
    aliases: {[mod: string]: string}

    constructor(dirs: string[], wdirs: string[], aliases = {}) {
        this.dirs = dirs;
        this.wdirs = wdirs;
        this.extensions = ['.js', '.ts'];
        this.aliases = aliases;
    }

    lookup(pth: string) {
        pth = this.aliases[pth] || pth;
        var inDirs = pth.startsWith('.') ? this.wdirs : this.dirs;
        for (let d of inDirs) {
            var mp = this.existsModule(d, pth);
            if (mp) return mp;
        }
        throw new FileNotFound(pth, inDirs);
    }

    existsModule(basedir: string, pth: string): PackageDir | SourceFile {
        var basename = path.basename(pth),
            pels = path.dirname(pth).split('/'), cwd = basedir;
        for (let pel of pels) {
            if (!(cwd = this._cd(cwd, pel))) return;
        }
        // files take precedence over directories
        var fpath = path.join(cwd, basename);
        for (var ext of ['', ...this.extensions]) {
            try {
                var epath = fpath + ext,
                    stat = fs.statSync(epath);
                if (stat.isFile()) return new SourceFile(epath);
            }
            catch { }
        }
        if (cwd = this._cd(cwd, basename))
            return new PackageDir(cwd);
    }

    _cd(cwd: string, rel: string) {
        cwd = path.join(cwd, rel);
        try {
            if (fs.statSync(cwd).isDirectory()) return cwd;
        }
        catch { }
    }

    static _aliased(cwd: string) {
        var p = new PackageDir(cwd);
        if (p.manifestFile) {
            var m = p.manifest;
            if (typeof m.browser == 'object') return m.browser;
        }
    }

    static from(dir: string) {
        var l = [dir], d = dir;
        while (d != '.' && d != '/') {
            d = path.dirname(d);
            l.push(d);
        }
        return new SearchPath(l.map(d => path.join(d, 'node_modules')), [dir],
                              this._aliased(dir));
    }
}


class Environment {
    infra: Library[] = []
    compilers: Transpiler[] = []
    cache: BuildCache = new BuildCache
    report: Report = new ReportSilent
}

class InEnvironment {
    env: Environment
    in(env: Environment) { this.env = env; return this; }
}


class Library {
    modules: (ModuleRef & {name: string})[] = []
}

class NodeJSRuntime extends Library {
    constructor() {
        super();
        this.modules = ['fs', 'path', 'events', 'assert', 'zlib', 'stream', 'util',
                        'crypto', 'net', 'tty', 'os', 'constants', 'vm',
                        'http', 'https', 'url', 'querystring', 'tls',
                        'buffer', 'process', 'child_process']
            .map(m => new NodeModule(m));
    }
}

class BrowserShims extends Library {
    constructor() {
        super();
        const findUp = (0||require)('find-up'),
              cwd = typeof __dirname !== 'undefined' ? __dirname : '.',
              shimdir = findUp.sync('shim', {cwd, type: 'directory'}),
              altnames = {zlib: 'browserify-zlib', crypto: 'crypto-browserify',
                          stream: 'stream-browserify'};
        this.modules.push(...['path', 'events', 'assert', 'util', 'zlib', 'stream',
                              'url', 'querystring', 'buffer', 'process']
            .map(m => new ShimModule(m, 
                new PackageDir(path.join(shimdir, 'node_modules', altnames[m] || m)))));
    }
}


class AcornCrawl extends InEnvironment {

    modules: {
        intrinsic: Map<string, ModuleRef>
        visited: Map<string, VisitResult>
    }

    constructor() {
        super();
        this.modules = {intrinsic: new Map, visited: new Map};
    }

    in(env: Environment) {
        for (let lib of env.infra)
            for (let m of lib.modules)
                this.modules.intrinsic.set(m.name, m);
        return super.in(env);
    }

    collect(entryPoints: ModuleRef[]) {
        var wl = [...entryPoints], vs = this.modules.visited;
        while (wl.length > 0) {
            var u = wl.pop().normalize(), key = u.id;
            if (!vs.has(key)) {
                var r = this.memo(u, u => this.visitModuleRef(u));
                wl.push(...r.deps.map(d => d.target));
                vs.set(key, r);
            }
        }
        return vs;
    }

    peek(ref: ModuleRef) {
        var vs = this.modules.visited, key = ref.id;
        return vs.get(key) || this.visitModuleRef(ref);
    }

    memo(m: ModuleRef, op: (m: ModuleRef) => VisitResult) {
        return this.env.cache.memo(m, 'visit', op);
    }

    visitFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        var fn = ref.filename;
        if      (fn.endsWith('.js'))   return this.visitJSFile(ref, opts);
        else if (fn.endsWith('.css'))  return this.visitCSSFile(ref, opts);
        else if (fn.endsWith('.json')) return this.visitJSONFile(ref, opts);
        else if (fn.endsWith('.html')) return this.visitHtmlFile(ref, opts);
        else {
            opts = {basedir: path.dirname(fn), ...opts};
            for (let cmplr of this.env.compilers) {
                if (cmplr.match(fn)) {
                    try {
                        var c = cmplr.compileFile(fn)
                    }
                    catch (e) {
                        this.env.report.error(ref, e);
                        return this.visitLeaf(new StubModule(fn, e)); 
                    }
                    return this.visitModuleRef(c, opts);
                }
            }
            throw new Error(`no compiler for '${fn}'`);
        }
    }

    visitJSFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        return this.visitJS(AcornJSModule.fromSourceFile(ref), opts);
    }

    visitCSSFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        var pt = PassThroughModule.fromSourceFile(ref);
        return {compiled: pt, deps: []};
    }

    visitJSONFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        var pt = PassThroughModule.fromSourceFile(ref);  /** @todo */
        return {compiled: pt, deps: []};
    }

    visitHtmlFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        return this.visitHtml(HtmlModule.fromSourceFile(ref).in(this.env), opts);
    }

    visitJS(m: AcornJSModule, opts: VisitOptions = {}): VisitResult {
        var sp = SearchPath.from(opts.basedir || m.dir);

        var lookup = (src: string) => {
            try {
                return this.modules.intrinsic.get(src) || sp.lookup(src);
            }
            catch (e) { return new StubModule(src, e); }
        };
        var mkdep = (u: acorn.Node, target: ModuleRef) => ({source: u, target});

        m.extractImports();
        var deps = m.imports.map(u => mkdep(u, lookup(u.source.value)))
            .concat(m.requires.map(u => mkdep(u, lookup(u.arguments[0].value))))
            .concat(m.exportsFrom.map(u => mkdep(u, lookup(u.source.value))));
        return {compiled: m, deps};
    }

    visitHtml(m: HtmlModule, opts: VisitOptions = {}): VisitResult {
        var dir = opts.basedir || m.dir, sp = new SearchPath([dir], [dir]);

        var lookup = (src: string) => {
            try       { return sp.lookup(src); }
            catch (e) { return new StubModule(src, e); }
        };
        var mkdep = <T>(u: T, target: ModuleRef) => ({source: u, target});

        var deps = m.getRefTags().map(({path, tag}) => mkdep(tag, lookup(path)));
        return {compiled: m, deps};
    }

    visitModuleRef(ref: ModuleRef, opts: VisitOptions = {}): VisitResult {
        if (ref instanceof PackageDir) return this.visitPackageDir(ref, opts);
        else if (ref instanceof SourceFile) return this.visitSourceFile(ref, opts);
        else if (ref instanceof TransientCode) return this.visitTransientCode(ref, opts);
        else if (ref instanceof StubModule || ref instanceof NodeModule)
            return this.visitLeaf(ref);
        else throw new Error(`cannot visit: ${ref.constructor.name}`);
    }

    visitSourceFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        this.env.report.visit(ref);
        return {...this.visitFile(ref, opts), origin: ref};
    }

    visitPackageDir(ref: PackageDir, opts: VisitOptions = {}): VisitResult {
        try {
            return this.visitModuleRef(ref.getMain(), opts);
        }
        catch (e) { return this.visitLeaf(new StubModule(ref.canonicalName, e)); }
    }

    visitTransientCode(ref: TransientCode, opts: VisitOptions = {}): VisitResult {
        switch (ref.contentType) {
        case 'js':
            return this.visitJS(new AcornJSModule(ref.content).in(this.env), opts);
        default:
            throw new Error(`cannot visit TransientCode(..., contentType='${ref.contentType}')`);
        }
    }

    visitLeaf(ref: NodeModule | StubModule): VisitResult {
        return {origin: ref, compiled: null, deps: []};
    }
}


type VisitOptions = {basedir?: string}
type VisitResult = {origin?: ModuleRef, compiled: CompilationUnit, deps: ModuleDependency[]}


interface CompilationUnit {
    env: Environment
    contentType: string
    process(key: string, deps: ModuleDependency[]): string
}


class PassThroughModule extends InEnvironment implements CompilationUnit {
    contentType: string
    content: string

    constructor(content: string, contentType: string) {
        super();
        this.contentType = contentType;
        this.content = content;
    }

    process(key: string, deps: ModuleDependency[]) { return this.content; }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), this.guessContentType(m));
    }

    static guessContentType(m: SourceFile) {
        if (m.filename.endsWith('.js')) return 'js';
        else if (m.filename.endsWith('.css')) return 'css';
        else return 'plain';
    }
}


class HtmlModule extends InEnvironment implements CompilationUnit {
    dir?: string
    text: string
    ast: parse5.Document
    contentType = 'html'

    scripts: parse5.DefaultTreeElement[]

    constructor(text: string, dir?: string) {
        super();
        this.dir = dir;
        this.text = text;
        this.ast = parse5.parse(text, {sourceCodeLocationInfo: true});
    }

    extractScripts() {
        this.scripts = [];
        parse5Walk(this.ast, (node: parse5.DefaultTreeNode) => {
            if (node.nodeName === 'script')
                this.scripts.push(node as parse5.DefaultTreeElement);
        });
    }

    /**
     * Extracts script tags with `kremlin://` URIs.
     * @todo auto-detect other tags referring to modules.
     */
    getRefTags() {
        if (!this.scripts) this.extractScripts();
        return this.scripts.map(sc => {
            var src = sc.attrs.find(a => a.name == 'src');
            if (src) {
                var mo = /^kremlin:\/\/(.*)$/.exec(src.value);
                if (mo) return {path: mo[1], tag: sc};
            }
        }).filter(x => x);
    }

    process(key: string, deps: ModuleDependency[]) {
        if (!this.scripts) this.extractScripts();

        var entries = this.scripts.map(u => {
            var dep = deps.find(d => d.source === u);
            return dep && {tag: u, ref: dep.target};
        }).filter(x => x);

        var tags = [].concat(...deps.map(d =>
            d.compiled.map(t => this.makeIncludeTag(t, d.target))
        )).join('\n');

        if (entries.length > 0) {
            return TextSource.interpolate(this.text, entries.map((e, i) => {
                var k = this.processScript(e.tag, e.ref);
                if (i == 0) k.text = tags + '\n' + k.text;
                return k;
            }));
        }
        else return this.text + '\n' + tags;
    }

    processScript(script: parse5.DefaultTreeElement, ref: ModuleRef) {
        var loc = script.sourceCodeLocation;   assert(loc);
        var at = {start: loc.startOffset, end: loc.endOffset};
        return {text: this.makeInitScript(ref), ...at};
    }

    makeIncludeTag(m: ModuleRef, origin: ModuleRef) {
        if (m instanceof SourceFile) {
            switch (m.contentType) {
            case 'js': return this.makeScriptTag(m);
            case 'css': return this.makeStylesheetLinkTag(m) + this.makeScriptStub(origin);
            default: return '';
            }
        }
        else throw new Error(`invalid html reference to '${m.constructor.name}'`);
    }

    makeScriptTag(m: SourceFile) {
        return `<script src="${m.filename}"></script>`;
    }

    makeStylesheetLinkTag(m: SourceFile) {
        return `<link href="${m.filename}" rel="stylesheet" type="text/${
                m.contentType || 'css'}">`;
    }

    makeScriptStub(ref: ModuleRef) {
        return `<script>kremlin.m['${ref.canonicalName}'] = () => ({});</script>`;
    }

    makeInitScript(ref: ModuleRef) {
        var key = ref.normalize().canonicalName;
        return `\n<script>kremlin.require('${key}');</script>`;
    }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), path.dirname(m.filename));
    }
}


class ConcatenatedJSModule extends InEnvironment implements CompilationUnit {
    contentType = 'js'

    process(key: string, deps: ModuleDependency[]) {
        var preamble = '#!/usr/bin/env node',  /** @todo only if executable */
            contents = this.readAll(deps),
            init = this.require(deps.filter(d => d.source));

        return [preamble].concat(...contents).concat(init).join('\n');
    }

    readAll(deps: ModuleDependency[]) {
        return deps.map(d => (d.compiled || []).map(ref =>
            ref instanceof SourceFile && ref.contentType === 'js' ?
                ref.readSync()
            : ref instanceof TransientCode && ref.contentType === 'js' ?
                ref.content
            : undefined
        ).filter(x => x));
    }

    require(deps: ModuleDependency[]) {
        var keys = deps.map(d => d.target.normalize().canonicalName);
        return `{ let c = kremlin.requires(${JSON.stringify(keys)}); if (typeof module !== 'undefined') module.exports = c; }`;
    }
}


class AcornJSModule extends InEnvironment implements CompilationUnit {
    dir?: string
    text: string
    ast: acorn.Node

    contentType = 'js'

    imports: AcornTypes.ImportDeclaration[]
    requires: RequireInvocation[]
    exports: AcornTypes.ExportDeclaration[]

    vars: {
        globals: Map<string, AcornTypes.Identifier[]>
        used: Set<string>
    }

    constructor(text: string, dir?: string) {
        super();
        this.text = text;
        this.dir = dir;
        this.ast = acorn.parse(text, {sourceType: 'module'});
    }

    extractImports() {
        this.imports = [];
        this.requires = [];
        this.exports = [];
        acornWalk.full(this.ast, (node) => {
            if      (this.isImport(node))   this.imports.push(node);
            else if (this.isRequire(node))  this.requires.push(node);
            else if (this.isExport(node))   this.exports.push(node);
        });
    }

    extractVars() {
        this.vars = {
            globals: this._extractGlobals(),
            used: this._extractVarNames()
        };
    }

    _extractGlobals() {
        assert(AcornUtils.is(this.ast, 'Program'));
        var prog = Object.assign({}, this.ast,   // strip imports so they don't count as locals
            {body: this.ast.body.filter(x => !this.isImport(x))});
        var globals = new Map;
        for (let {name, nodes} of acornGlobals(prog))
            globals.set(name, nodes);
        return globals;
    }

    _extractVarNames() {
        var s: Set<string> = new Set;
        acornWalk.full(this.ast, u => {
            if (AcornUtils.is(u, "Identifier")) s.add(u.name);
        });
        return s;
    }

    get exportsFrom() {
        return this.exports.filter(u => this.isExportFrom(u)) as
                AcornTypes.ExportNamedDeclaration[];
    }

    isImport(node: acorn.Node): node is AcornTypes.ImportDeclaration {
        return AcornUtils.is(node, 'ImportDeclaration');
    }

    isRequire(node: acorn.Node): node is RequireInvocation {
        const is = AcornUtils.is;
        return is(node, 'CallExpression') && 
               is(node.callee, 'Identifier') && node.callee.name === 'require' &&
               node.arguments.length == 1 && is(node.arguments[0], 'Literal');
    }

    isExport(node: acorn.Node): node is AcornTypes.ExportDeclaration {
        return AcornUtils.is(node, 'ExportNamedDeclaration') ||
               AcornUtils.is(node, 'ExportDefaultDeclaration');
    }

    isExportFrom(node: acorn.Node): node is AcornTypes.ExportNamedDeclaration {
        return AcornUtils.is(node, 'ExportNamedDeclaration') && !!node.source;
    }

    _isShorthandProperty(node: AcornTypes.Identifier) {
        return node.parents.slice(-2).some(p =>
            AcornUtils.is(p, "Property") && p.shorthand);
    }

    process(key: string, deps: ModuleDependency<acorn.Node>[]) {
        if (!this.vars) this.extractVars();

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

            prog = TextSource.interpolate(this.text, 
                [].concat(...imports, ...requires, ...exports)
                .map(([node, text]) => ({...node, text})));

        if (!prog.match(/\n\s+$/)) prog += '\n'; // in case prog ends with single-line comment

        return `kremlin.m['${key}'] = (module,exports) => {${prog}};`;
    }

    processImport(imp: AcornTypes.ImportDeclaration, ref: ModuleRef) {
        var lhs: string, refs = [], isDefault = false;
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
                assert(impspec.type === 'ImportSpecifier');
                let local = impspec.local.name, imported = impspec.imported.name;
                refs.push(...this.updateReferences(local, `${lhs}.${imported}`));
            }
        }
        return [[imp, `let ${lhs} = ${this.makeRequire(ref, isDefault)};`]]
               .concat(refs);
    }

    processRequire(req: RequireInvocation, ref: ModuleRef) {
        return [[req, this.makeRequire(ref)]];
    }

    processExport(exp: AcornTypes.ExportDeclaration, ref: ModuleRef) {
        var locals = [], rhs: string, is = AcornUtils.is, d = exp.declaration;

        if (is(exp, 'ExportNamedDeclaration')) {
            if (d) {  // <- `export const` etc.
                locals = (<any>d).declarations.map(u => u.id.name);  /** @todo typing & test other cases */
            }
            else {
                for (let expspec of exp.specifiers) {
                    assert(expspec.type === 'ExportSpecifier');
                    let local = expspec.local.name, exported = expspec.exported.name;
                    locals.push((local == exported) ? local : `${local}:${exported}`);
                }
            }

            rhs = (exp.source && ref)   // <- `export .. from`
                    ? `${this.makeRequire(ref)}, ${JSON.stringify(locals)}`
                    : `{${locals}}`;

            if (d)
                return [[{start: exp.start, end: d.start}, ''],  // <- remove `export` modifier
                    [{start: exp.end, end:exp.end}, `\nkremlin.export(module, ${rhs});`]];
            else
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

    makeRequire(ref: ModuleRef, isDefault: boolean = false) {
        if (ref instanceof NodeModule) {
            return `require('${ref.name}')`;  // @todo configure by target
        }
        else {
            var key = ref.normalize().canonicalName;
            return `kremlin.require('${key}', ${isDefault})`;
        }
    }

    updateReferences(name: string, expr: string) {
        var refs = [];
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
            if (!this.vars.used.has(nm)) {
                this.vars.used.add(nm);
                return nm;
            }
        }
    }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), path.dirname(m.filename));
    }

    static fromFile(filename: string) {
        return new this(
            fs.readFileSync(filename, 'utf-8'),
            path.dirname(filename));
    }
}

namespace TextSource {
    /**
     * Utility function for replacing some elements within a source file.
     * @param inp source text
     * @param elements places to interpolate some text into
     */
    export function interpolate(inp: string, elements: {start: number, end: number, text: string}[]) {
        var out = '', i = 0;
        for (let el of elements.sort((a, b) => a.start - b.start)) {
            out += inp.substring(i, el.start) + el.text;
            i = el.end;
        }
        return out + inp.substring(i);
    }
}

declare class RequireInvocation extends AcornTypes.CallExpression {
    arguments: AcornTypes.Literal[]
}


declare namespace AcornTypes {

    class Program extends acorn.Node {
        body: acorn.Node[]
    }

    class Literal extends acorn.Node {
        value: string
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

    class ExportDeclaration extends acorn.Node {
        type: "ExportNamedDeclaration" | "ExportDefaultDeclaration"
        declaration?: acorn.Node
    }

    class ExportNamedDeclaration extends ExportDeclaration {
        type: "ExportNamedDeclaration"
        source?: Literal
        specifiers: ExportSpecifier[]
    }

    class ExportDefaultDeclaration extends ExportDeclaration {
        type: "ExportDefaultDeclaration"
        declaration: acorn.Node   // not optional
    }

    class ExportSpecifier extends acorn.Node {
        local: Identifier
        exported: Identifier
    }

    class CallExpression extends acorn.Node {
        type: "CallExpression"
        callee: acorn.Node
        arguments: acorn.Node[]
    }

    class Identifier extends acorn.Node {
        name: string
        parents: acorn.Node[]  // actually this exists in for all acorn.Nodes :/
    }

    class Property extends acorn.Node {
        shorthand: boolean
    }

}

namespace AcornUtils {
    export function is(node: acorn.Node, type: "Program"): node is AcornTypes.Program
    export function is(node: acorn.Node, type: "ImportSpecifier"): node is AcornTypes.ImportSpecifier
    export function is(node: acorn.Node, type: "ExportNamedDeclaration"): node is AcornTypes.ExportNamedDeclaration
    export function is(node: acorn.Node, type: "ExportDefaultDeclaration"): node is AcornTypes.ExportDefaultDeclaration
    export function is(node: acorn.Node, type: "CallExpression"): node is AcornTypes.CallExpression
    export function is(node: acorn.Node, type: "Identifier"): node is AcornTypes.Identifier
    export function is(node: acorn.Node, type: "Property"): node is AcornTypes.Property
    export function is(node: acorn.Node, type: string): boolean

    export function is(node: acorn.Node, type: string) { return node.type === type; }
}



export { Environment, InEnvironment, Library, NodeJSRuntime, BrowserShims,
         AcornCrawl, SearchPath, VisitOptions, VisitResult,
         CompilationUnit, PassThroughModule, HtmlModule, ConcatenatedJSModule }