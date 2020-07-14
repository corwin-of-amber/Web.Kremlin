const fs = (0||require)('fs'),   // use native fs
      path = (0||require)('path'),
      findUp = (0||require)('find-up');
import assert from 'assert';

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import acornGlobals from 'acorn-globals';
import { Transpiler } from './transpile';
import './ui/introspect';



class SearchPath {
    dirs: string[]
    wdirs: string[]
    extensions: string[]

    constructor(dirs: string[], wdirs: string[]) {
        this.dirs = dirs;
        this.wdirs = wdirs;
        this.extensions = ['.js', '.ts'];
    }

    lookup(pth: string) {
        var inDirs = pth.startsWith('.') ? this.wdirs : this.dirs;
        for (let d of inDirs) {
            var rp = path.join(d, pth), mp: ModuleRef;
            if (mp = this.existsModule(rp)) return mp;
        }
        throw new FileNotFound(pth, inDirs);
    }

    existsModule(pth: string): PackageDir | SourceFile {
        try {
            var stat = fs.statSync(pth);
            if (stat.isDirectory()) return new PackageDir(pth);
            else if (stat.isFile()) return new SourceFile(pth);
        }
        catch { }
        for (var ext of this.extensions) {
            try {
                var epth = pth + ext,
                    stat = fs.statSync(epth);
                if (stat.isFile()) return new SourceFile(epth);
            }
            catch { }
        }
    }

    static from(dir: string) {
        var l = [dir], d = dir;
        while (d != '.' && d != '/') {
            d = path.dirname(d);
            l.push(d);
        }
        return new SearchPath(l.map(d => path.join(d, 'node_modules')), [dir]);
    }
}


abstract class ModuleRef {
    get id() {
        return JSON.stringify([this.constructor.name, this]);
    }
    abstract get canonicalName(): string
    normalize(): ModuleRef { return this; }
}

class PackageDir extends ModuleRef {
    dir: string
    constructor(dir: string) { super(); this.dir = dir; }
    get canonicalName() {
        var m = this.manifest;
        return m.name && m.version ? `${m.name}@${m.version}` : this.dir; 
    }
    get manifest() {
        try {
            var m = fs.readFileSync(path.join(this.dir, 'package.json'));
            return JSON.parse(m);
        }
        catch (e) {
            console.error(`failed to read manifest in ${this.dir}`, e);
            return {}; 
        }
    }
    get(filename: string) {
        return new SourceFile(path.join(this.dir, filename), this);
    }
    getMain(): SourceFile {
        return this.get(this.manifest.main || 'index.js');
    }
    normalize(): SourceFile { return this.getMain(); }
}

class SourceFile extends ModuleRef {
    filename: string
    package?: PackageDir
    constructor(filename: string, pkg?: PackageDir) {
        super();
        this.filename = filename;
        this.package = pkg;
    }
    get id() { return JSON.stringify([this.constructor.name, this.filename]); };
    get canonicalName() {
        return this.package ? `${this.package.canonicalName}:${path.relative(this.package.dir, this.filename)}`
             : this.filename;
    }
    normalize() {
        if (!this.package) {
            var cwd = path.dirname(this.filename),
                fu = findUp.sync('package.json', {cwd}) || findUp('node_modules', {cwd});
            if (fu) this.package = new PackageDir(path.dirname(fu));
        }
        return this;
    }
}

class TransientCode extends ModuleRef {
    contentType: string
    content: string
    constructor(content: string, contentType: string) {
        super();
        this.contentType = contentType;
        this.content = content;
    }
    get canonicalName(): string { throw new Error('Internal error: TransientCode#canonicalName'); }
}

class NodeModule extends ModuleRef {
    name: string
    constructor(name: string) { super(); this.name = name; }
    get canonicalName() { return `node://${this.name}`; }
}

class StubModule extends ModuleRef {
    name: string
    reason: ModuleResolutionError
    constructor(name: string, reason: ModuleResolutionError)
    { super(); this.name = name; this.reason = reason; }
    get canonicalName() { return `stub://${this.name}`; }
}

type ModuleDependency = {reference: any, target: ModuleRef}

class ModuleResolutionError { }

class FileNotFound extends ModuleResolutionError {
    path: string
    from: string[]

    constructor(path: string, from: string[]) {
        super();
        this.path = path;
        this.from = from;
    }
}


class Library {
    modules: (ModuleRef & {name: string})[] = []
}

class NodeJSRuntime extends Library {
    constructor() {
        super();
        this.modules = ['fs', 'path', 'events', 'assert', 'zlib', 'stream', 'util']
            .map(m => new NodeModule(m));
    }
}


class AcornCrawl {

    modules: {
        intrinsic: Map<string, ModuleRef>
        visited: Map<string, VisitResult>
    }
    compilers: Transpiler[] = []

    constructor(infra: Library[] = []) {
        this.modules = {intrinsic: new Map, visited: new Map};
        for (let lib of infra)
            for (let m of lib.modules)
                this.modules.intrinsic.set(m.name, m);
    }

    collect(entryPoints: ModuleRef[]) {
        var wl = [...entryPoints], vs = this.modules.visited;
        while (wl.length > 0) {
            var u = wl.pop(), key = u.id;
            if (!vs.has(key)) {
                var r = this.visitModuleRef(u);
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

    visitFile(filename: string, opts: VisitOptions = {}): VisitResult {
        console.log(`%cvisit ${filename}`, 'color: #8080ff');
        if (filename.match(/\.js$/)) return this.visitJSFile(filename, opts);
        else {
            opts = {basedir: path.dirname(filename), ...opts};
            for (let cmplr of this.compilers) {
                if (cmplr.match(filename)) {
                    try {
                        var c = cmplr.compileFile(filename)
                    }
                    catch (e) { console.error(e); return this.visitLeaf(new StubModule(filename, e)); }
                    return this.visitModuleRef(c, opts);
                }
            }
            throw new Error(`no compiler for '${filename}'`);
        }
    }

    visitJSFile(filename: string, opts: VisitOptions = {}): VisitResult {
        return this.visitJS(AcornJSModule.fromFile(filename), opts);
    }

    visitJS(m: AcornJSModule, opts: VisitOptions = {}): VisitResult {
        var sp = SearchPath.from(opts.basedir || m.dir);

        var lookup = (src: string) => {
            try {
                return this.modules.intrinsic.get(src) || sp.lookup(src);
            }
            catch (e) { return new StubModule(src, e); }
        };
        var mkdep = (u: any, target: ModuleRef) => ({reference: u, target});

        m.extractImports();
        var deps = m.imports.map(u => mkdep(u, lookup(u.source.value)))
            .concat(m.requires.map(u => mkdep(u, lookup(u.arguments[0].value))));
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
        return {...this.visitFile(ref.filename, opts), origin: ref};
    }

    visitPackageDir(ref: PackageDir, opts: VisitOptions = {}): VisitResult {
        return this.visitModuleRef(ref.getMain(), opts);
    }

    visitTransientCode(ref: TransientCode, opts: VisitOptions = {}): VisitResult {
        switch (ref.contentType) {
        case 'js':
            return this.visitJS(new AcornJSModule(ref.content), opts);
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
    contentType: string
    process(key: string, deps: ModuleDependency[]): string
}


class PassThroughModule implements CompilationUnit {
    contentType: string
    content: string

    constructor(content: string, contentType: string) {
        this.contentType = contentType;
        this.content = content;
    }

    process(key: string, deps: ModuleDependency[]) { return this.content; }

    static fromSourceFile(m: SourceFile) {
        return new this(
            fs.readFileSync(m.filename, 'utf-8'),
            this.guessContentType(m));
    }

    static guessContentType(m: SourceFile) {
        if (m.filename.endsWith('.js')) return 'js';
        else if (m.filename.endsWith('.css')) return 'css';
        else return 'plain';
    }
}


class HtmlModule extends PassThroughModule {
    contentType: "html"

    constructor(text: string) {
        super(text, 'html');
    }

    process(key: string, deps: ModuleDependency[]) {
        var tags = deps.map(d => this.makeIncludeTag(d.target));
        // @todo interpolate tags
        return [this.content, ...tags].join('\n');
    }

    makeIncludeTag(m: ModuleRef) {
        if (m instanceof SourceFile) {
            return this.makeScriptTag(m);
        }
        else throw new Error(`invalid html reference to '${m.constructor.name}'`);
    }

    makeScriptTag(m: SourceFile) {
        return `<script src="${m.filename}"></script>`;
    }
}


class AcornJSModule implements CompilationUnit {
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
        this.text = text;
        this.dir = dir;
        this.ast = acorn.parse(text, {sourceType: 'module'});
    }

    extractImports() {
        this.imports = [];
        this.requires = [];
        this.exports = [];
        walk.full(this.ast, (node) => {
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
        walk.full(this.ast, u => {
            if (AcornUtils.is(u, "Identifier")) s.add(u.name);
        });
        return s;
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
        return AcornUtils.is(node, 'ExportNamedDeclaration') || AcornUtils.is(node, 'ExportDefaultDeclaration');
    }

    process(key: string, deps: ModuleDependency[]) {
        if (!this.vars) this.extractVars();

        var imports = this.imports.map(imp => {
                var dep = deps.find(d => d.reference === imp);
                return dep ? this.processImport(imp, dep.target) : [];
            }),
            requires = this.requires.map(req => {
                var dep = deps.find(d => d.reference === req);
                return dep ? [this.processRequire(req, dep.target)] : [];
            }),
            exports = this.exports.map(exp => [this.processExport(exp)]),

            prog = this.interpolate(this.text, 
                [].concat(...imports, ...requires, ...exports)
                .map(([node, text]) => ({...node, text})));

        return `kremlin.m['${key}'] = (module,exports) => {${prog}};`;
    }

    processImport(imp: AcornTypes.ImportDeclaration, ref: ModuleRef) {
        var lhs: string, refs = [];
        if (imp.specifiers.length == 1 && 
            (imp.specifiers[0].type === 'ImportDefaultSpecifier'
             || imp.specifiers[0].type === 'ImportNamespaceSpecifier')) {
            lhs = imp.specifiers[0].local.name;
        }
        else {
            var locals = [];
            lhs = this._freshVar();
            for (let impspec of imp.specifiers) {
                assert(impspec.type === 'ImportSpecifier');
                let local = impspec.local.name, imported = impspec.imported.name;
                locals.push((local == imported) ? local : `${imported}:${local}`);
                for (let refnode of this.vars.globals.get(local) || []) {
                    refs.push([refnode, `${lhs}.${imported}`]);
                }
            }
        }
        return [[imp, `let ${lhs} = ${this.makeRequire(ref)};`]].concat(refs);
    }

    processRequire(req: RequireInvocation, ref: ModuleRef) {
        return [req, this.makeRequire(ref)];
    }

    processExport(exp: AcornTypes.ExportDeclaration) {
        var locals = [], rhs: string, is = AcornUtils.is;
        if (is(exp, 'ExportNamedDeclaration')) {
            for (let expspec of exp.specifiers) {
                assert(expspec.type === 'ExportSpecifier');
                let local = expspec.local.name, exported = expspec.exported.name;
                locals.push((local == exported) ? local : `${local}:${exported}`);
            }
            rhs = `{${locals}}`;
        }
        else if (is(exp, 'ExportDefaultDeclaration')) {
            rhs = this.text.substring(exp.declaration.start, exp.declaration.end);
        }
        else throw new Error(`invalid export '${exp.type}'`);
        return [exp, `kremlin.export(module, ${rhs});`];
    }

    makeRequire(ref: ModuleRef) {
        if (ref instanceof NodeModule) {
            return `require('${ref.name}')`;  // @todo configure by target
        }
        else {
            var key = ref.normalize().canonicalName;
            return `kremlin.require('${key}')`;
        }
    }

    interpolate(inp: string, elements: {start: number, end: number, text: string}[]) {
        var out = '', i = 0;
        for (let el of elements.sort((a, b) => a.start - b.start)) {
            out += inp.substring(i, el.start) + el.text;
            i = el.end;
        }
        return out + inp.substring(i);
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

    static fromFile(filename: string) {
        return new AcornJSModule(
            fs.readFileSync(filename, 'utf-8'),
            path.dirname(filename));
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
    }

    class ExportNamedDeclaration extends ExportDeclaration {
        type: "ExportNamedDeclaration"
        source?: Literal
        specifiers: ExportSpecifier[]
    }

    class ExportDefaultDeclaration extends ExportDeclaration {
        type: "ExportDefaultDeclaration"
        declaration: acorn.Node
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
    }

}

namespace AcornUtils {
    export function is(node: acorn.Node, type: "Program"): node is AcornTypes.Program
    export function is(node: acorn.Node, type: "ImportSpecifier"): node is AcornTypes.ImportSpecifier
    export function is(node: acorn.Node, type: "CallExpression"): node is AcornTypes.CallExpression
    export function is(node: acorn.Node, type: "Identifier"): node is AcornTypes.Identifier
    export function is(node: acorn.Node, type: "ExportNamedDeclaration"): node is AcornTypes.ExportNamedDeclaration
    export function is(node: acorn.Node, type: "ExportDefaultDeclaration"): node is AcornTypes.ExportDefaultDeclaration
    export function is(node: acorn.Node, type: string): boolean

    export function is(node: acorn.Node, type: string) { return node.type === type; }
}



export { AcornCrawl, SearchPath, ModuleRef, SourceFile, PackageDir, TransientCode, StubModule, NodeModule,
         Library, NodeJSRuntime, ModuleDependency, PassThroughModule, HtmlModule,
         VisitOptions, VisitResult, CompilationUnit }