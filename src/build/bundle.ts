const fs = (0||require)('fs');   // use native fs
import path from 'path';

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { DummyCompiler } from './compile';
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


interface ModuleRef { }
class PackageDir implements ModuleRef {
    dir: string
    constructor(dir: string) { this.dir = dir; }
}
class SourceFile implements ModuleRef {
    filename: string
    constructor(filename: string) { this.filename = filename; }
}
class NodeModule implements ModuleRef {
    name: string
    constructor(name: string) { this.name = name; }
}

class FileNotFound {
    path: string
    from: string[]

    constructor(path: string, from: string[]) {
        this.path = path;
        this.from = from;
    }
}


class AcornCrawl {

    modules: {
        intrinsic: Map<String, ModuleRef>
    }
    compilers: DummyCompiler[]

    constructor() {
        this.modules = {intrinsic: new Map};
        for (let m of ['fs', 'path', 'events', 'assert', 'zlib'])
            this.modules.intrinsic.set(m, new NodeModule(m));

        this.compilers = [];
    }

    visit(filename: string, opts: VisitOptions = {}): VisitResult {
        if (filename.match(/\.js$/)) return this.visitJS(filename, opts);
        else {
            opts = {basedir: path.dirname(filename), ...opts};
            for (let cmplr of this.compilers) {
                return this.visitModuleRef(cmplr.compileFile(filename), opts);
            }
            throw new Error(`no compiler for '${filename}'`);
        }
    }

    visitJS(filename: string, opts: VisitOptions = {}): VisitResult {
        var m = AcornJSModule.fromFile(filename),
            sp = SearchPath.from(opts.basedir || m.dir);

        var lookup = (src: string) =>
            this.modules.intrinsic.get(src) || sp.lookup(src);

        m.extractImports();
        var deps = m.imports.map(u => lookup(u.source.value))
            .concat(m.requires.map(u => lookup(u.arguments[0].value)));
        return {module: m, deps};
    }

    visitModuleRef(ref: ModuleRef, opts: VisitOptions = {}) {
        if (ref instanceof SourceFile) return this.visitSourceFile(ref, opts);
        else throw new Error(`cannot visit: ${ref.constructor.name}`);
    }

    visitSourceFile(ref: SourceFile, opts: VisitOptions = {}) {
        return this.visit(ref.filename, opts);
    }
}


type VisitOptions = {basedir?: string}
type VisitResult = {module: AcornJSModule, deps: ModuleRef[]}


class AcornJSModule {
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
        type: "ImportSpecifier"
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



export { AcornCrawl, SearchPath, ModuleRef, SourceFile, PackageDir,
         VisitOptions, VisitResult }