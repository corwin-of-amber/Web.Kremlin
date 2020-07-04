const fs = (0||require)('fs'),   // use native fs
      mkdirp = (0||require)('mkdirp');
import path from 'path';
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
    get canonicalName() { assert(false); return ''; }
    get manifest() {
        var m = fs.readFileSync(path.join(this.dir, 'package.json'));
        return JSON.parse(m);
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
    get canonicalName() { return this.filename; }
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


class AcornCrawl {

    modules: {
        intrinsic: Map<string, ModuleRef>
        visited: Map<string, VisitResult>
    }
    compilers: Transpiler[] = []

    constructor() {
        this.modules = {intrinsic: new Map, visited: new Map};
        for (let m of ['fs', 'path', 'events', 'assert', 'zlib'])
            this.modules.intrinsic.set(m, new NodeModule(m));
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

    visit(filename: string, opts: VisitOptions = {}): VisitResult {
        console.log(`%cvisit ${filename}`, 'color: #8080ff');
        if (filename.match(/\.js$/)) return this.visitJS(filename, opts);
        else {
            opts = {basedir: path.dirname(filename), ...opts};
            for (let cmplr of this.compilers) {
                if (cmplr.match(filename)) {
                    try {
                        var c = cmplr.compileFile(filename)
                    }
                    catch (e) { return this.visitLeaf(new StubModule(filename, e)); }
                    return this.visitModuleRef(c, opts);
                }
            }
            throw new Error(`no compiler for '${filename}'`);
        }
    }

    visitJS(filename: string, opts: VisitOptions = {}): VisitResult {
        var m = AcornJSModule.fromFile(filename),
            sp = SearchPath.from(opts.basedir || m.dir);

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
        else if (ref instanceof StubModule || ref instanceof NodeModule)
            return this.visitLeaf(ref);
        else throw new Error(`cannot visit: ${ref.constructor.name}`);
    }

    visitSourceFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        return {...this.visit(ref.filename, opts), origin: ref};
    }

    visitPackageDir(ref: PackageDir, opts: VisitOptions = {}): VisitResult {
        return this.visitModuleRef(ref.getMain(), opts);
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
        var lhs: string, refs = [],
            key = ref.normalize().canonicalName;
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
        return [[imp, `let ${lhs} = kremlin.require('${key}');`]].concat(refs);
    }

    processRequire(req: RequireInvocation, ref: ModuleRef) {
        var key = ref.normalize().canonicalName;
        return [req, `kremlin.require('${key}')`];
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


class DeployModule {
    ref: ModuleRef
    compiled: CompilationUnit
    deps: ModuleDependency[]

    constructor(ref: ModuleRef, compiled: CompilationUnit, deps: ModuleDependency[]) {
        this.ref = ref;
        this.compiled = compiled;
        this.deps = deps;
    }

    get targets(): {body: string, contentType: string}[] {
        if (this.compiled)
            return [{body: this.compiled.process(this.ref.canonicalName, this.deps), 
                     contentType: this.compiled.contentType}];
        else
            return [];
    }

    get output(): string {
        if (this.ref instanceof PackageDir)
            assert(0);
        else if (this.ref instanceof SourceFile)
            return path.basename(this.ref.filename);
        else if (this.ref instanceof StubModule || this.ref instanceof NodeModule)
            return path.join('stubs', this.ref['name']);
    }
}


class Deployment {
    outDir: string
    files: Set<string> = new Set

    constructor(outDir: string) { this.outDir = outDir; }

    add(dmod: DeployModule) {
        var outfn = dmod.output;
        for (let {body, contentType} of dmod.targets) {
            this.writeFileSync(this.newFilename(outfn, contentType), body);
        }
    }

    addVisitResult(vis: VisitResult) {
        return this.add(new DeployModule(vis.origin.normalize(), vis.compiled, vis.deps));
    }

    newFilename(filename: string, contentType: string) {
        var ext = `.${contentType}`;
        filename = this.withoutExt(filename, ext);
        var cand = filename, i = 0;
        while (this.files.has(cand)) {
            cand = `${filename}-${i}`; i++;
        }
        return this.withExt(cand, ext);
    }

    withExt(filename: string, ext: string) {
        return filename.endsWith(ext) ? filename : filename + ext;
    }
    withoutExt(filename: string, ext: string) {
        return filename.endsWith(ext) ? filename.slice(0, -ext.length) : filename;
    }

    writeFileSync(filename: string, content: string) {
        var outp = path.join(this.outDir, filename);
        console.log(`%c> ${outp}`, "color: #ff8080");
        mkdirp.sync(path.dirname(outp));
        fs.writeFileSync(outp, content);
        this.files.add(filename);
        return new SourceFile(outp);
    }
}



export { AcornCrawl, SearchPath, ModuleRef, SourceFile, PackageDir,
         VisitOptions, VisitResult, Deployment }