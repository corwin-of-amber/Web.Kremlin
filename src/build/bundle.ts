const fs = (0||require)('fs'),   // use native fs
      mkdirp = (0||require)('mkdirp');
import path from 'path';

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { DummyCompiler } from './compile';
import './ui/introspect';
import { assert } from 'console';



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
    compilers: DummyCompiler[] = []

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
        console.log(`%cvisit ${filename}`, 'color: #0000ff');
        if (filename.match(/\.js$/)) return this.visitJS(filename, opts);
        else {
            opts = {basedir: path.dirname(filename), ...opts};
            for (let cmplr of this.compilers) {
                try {
                    var c = cmplr.compileFile(filename)
                }
                catch (e) { return this.visitLeaf(new StubModule(filename, e)); }
                return this.visitModuleRef(c, opts);
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
    process(key: string, deps: ModuleDependency[]): string
}


class AcornJSModule implements CompilationUnit {
    dir?: string
    text: string
    ast: acorn.Node

    imports: AcornTypes.ImportDeclaration[]
    requires: RequireInvocation[]

    constructor(text: string, dir?: string) {
        this.text = text;
        this.dir = dir;
        this.ast = acorn.parse(text, {sourceType: 'module'});
    }

    extractImports() {
        this.imports = [];
        this.requires = [];
        walk.full(this.ast, (node) => {
            if (this.isImport(node)) {
                this.imports.push(node);
            }
            else if (this.isRequire(node)) {
                this.requires.push(node);
            }
        });
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

    process(key: string, deps: ModuleDependency[]) {
        var prog = this.interpolate(this.text,
            this.imports.map(imp => {
                var dep = deps.find(d => d.reference === imp);
                return dep && {...imp, text: this.processImport(imp, dep.target)};
            }));
        return `kremlin['${key}'] = () => {${prog}};`;
    }

    processImport(imp: AcornTypes.ImportDeclaration, ref: ModuleRef) {
        var lhs: string;
        if (imp.specifiers.length == 1 && 
            (imp.specifiers[0].type === 'ImportDefaultSpecifier'
             || imp.specifiers[0].type === 'ImportNamespaceSpecifier')) {
            lhs = imp.specifiers[0].local.name;
        }
        else {
            var locals = [];
            for (let impspec of imp.specifiers) {
                console.log(impspec);
                assert(impspec.type === 'ImportSpecifier');
                let local = impspec.local.name, imported = impspec.imported.name;
                locals.push((local == imported) ? local : `${imported}:${local}`);
            }
            lhs = `{${locals}}`;
        }
        var key = ref.normalize().canonicalName;
        return `let ${lhs} = require('${key}');`;
    }

    interpolate(inp: string, elements: {start: number, end: number, text: string}[]) {
        var out = '', i = 0;
        for (let el of elements.sort((a, b) => a.start - b.start)) {
            out += inp.substring(i, el.start) + el.text;
            i = el.end;
        }
        return out + inp.substring(i);
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
    export function is(node: acorn.Node, type: "ImportSpecifier"): node is AcornTypes.ImportSpecifier
    export function is(node: acorn.Node, type: "CallExpression"): node is AcornTypes.CallExpression
    export function is(node: acorn.Node, type: "Identifier"): node is AcornTypes.Identifier
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

    save(deploy: Deployment): ModuleRef {
        if (this.compiled) {
            return deploy.writeFileSync(this.output,
                this.compiled.process(this.ref.canonicalName, this.deps));
        }
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
    constructor(outDir: string) { this.outDir = outDir; }

    add(dmod: DeployModule) { return dmod.save(this); }

    addVisitResult(vis: VisitResult) {
        return this.add(new DeployModule(vis.origin.normalize(), vis.compiled, vis.deps));
    }

    writeFileSync(filename: string, content: string) {
        var outp = path.join(this.outDir, filename);
        console.log(outp);
        mkdirp.sync(path.dirname(outp));
        fs.writeFileSync(outp, content);
        return new SourceFile(outp);
    }
}



export { AcornCrawl, SearchPath, ModuleRef, SourceFile, PackageDir,
         VisitOptions, VisitResult, Deployment }