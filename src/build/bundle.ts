import fs from 'fs';      /* @kremlin.native */
import path from 'path';  /* @kremlin.native */
import assert from 'assert';

import * as acorn from 'acorn';
import { Environment, InEnvironment } from './environment';
import { ModuleRef, SourceFile, PackageDir, TransientCode, GroupedModules,
         NodeModule,
         StubModule, ModuleDependency, FileNotFound, BinaryAsset } from './modules';
import { CompilationUnit } from './compilation-unit';
import { PassThroughModule, JsonModule } from './loaders/basic';
import { AcornJSModule, StubJSModule } from './loaders/js';
import { HtmlModule } from './loaders/html';
import { PostCSSModule } from './loaders/css';



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
        // @todo can the treatment of aliases be done completely within `existsModule`?
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
            pels = path.dirname(pth).split('/').filter(x => x != '.');

        let cwd = this._withAliases(new SearchPath.DirCursor(basedir, {}));
        for (let pel of pels)
            cwd = this._withAliases(cwd.get(pel));

        for (var ext of ['', ...this.extensions]) {
            try {
                var entry = cwd.get(basename + ext);
                    //stat = fs.statSync(epath);
                if (entry.isFile()) return new SourceFile(entry.path);
            }
            catch { }
        }
        if ((cwd = cwd.get(basename)).isDirectory())
            return new PackageDir(cwd.path);
    }

    _withAliases(cur: SearchPath.DirCursor) {
        let aliases = SearchPath._aliased(cur.path);
        cur.aliases = SearchPath.aliasesToTree(aliases, cur.aliases, cur.path);
        return cur;
    }

    static _aliased(cwd: string) {
        var pd = new PackageDir(cwd);
        return Object.assign({},
            ...Environment.get().policy.packageAliases(pd));
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

namespace SearchPath {
    export class DirCursor {
        phys: string /** physical path */
        aliases: AliasTree

        constructor(phys: string, aliases: AliasTree) {
            this.phys = phys;
            this.aliases = aliases;
        }

        get(name: string) {
            if (name === '.') return this;
            else return new DirCursor(path.join(this.path, name),
                Object.hasOwn(this.aliases, name) ? aobj(this.aliases[name]) : {});
        }

        get path() {
            return Object.hasOwn(this.aliases, '.')
                   ? (this.aliases['.'] as string) : this.phys;
        }

        exists() { return this._stat(_ => true); }
        isFile() { return this._stat(_ => _.isFile()); }
        isDirectory() { return this._stat(_ => _.isDirectory()); }

        _stat(op: (s: fs.Stats) => boolean) {
            try { return op(fs.statSync(this.path)); }
            catch { return false; }
        }
    }

    type AliasTree = {[name: string]: string | AliasTree} /* note: only '.' is allowed to have a string value */

    export function aliasesToTree(desc: {[name: string]: string}, into: AliasTree = {}, baseDir?: string) {
        let al: AliasTree = into;
        for (let [name, target] of Object.entries(desc)) {
            if (typeof target !== 'string') continue;  // better filter out beforehand?..
            let steps = name.split('/').filter(x => x && x !== '.'),
                cur: AliasTree = al;
            for (let pel of steps) {
                cur = aobj(cur[pel] ??= {});
            }
            cur['.'] = baseDir ? path.join(baseDir, target) : target;
        }
        return al;
    }

    function aobj<T>(a: T): T & object {
        assert(typeof a === 'object');
        return a;
    }
}


class AcornCrawl extends InEnvironment {

    modules: {
        intrinsic: Map<string, ModuleRef>
        substitute: Map<string, ModuleRef>
        visited: Map<string, VisitResult>
    }

    constructor() {
        super();
        this.modules = {intrinsic: new Map, substitute: new Map,
                        visited: new Map};
    }

    in(env: Environment) {
        for (let lib of env.infra) {
            var modmap = lib.override ? this.modules.substitute
                                      : this.modules.intrinsic;
            for (let m of lib.modules)
                modmap.set(m.name, m);
        }
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
        return this.env.cache.build.memo(m, 'visit', op);
    }

    safely(ref: ModuleRef, name: string, context: string, f: () => VisitResult): VisitResult {
        try {
            return f();
        }
        catch (e) {
            this.env.report.error(ref, e);
            return this.visitLeaf(new StubModule(name, context, e)); 
        }
    }

    visitFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        var fn = ref.filename;
        if      (/\.[cm]?js$/.test(fn))   return this.visitJSFile(ref, opts);
        else if (fn.endsWith('.css'))  return this.visitCSSFile(ref, opts);
        else if (fn.endsWith('.json')) return this.visitJSONFile(ref, opts);
        else if (fn.endsWith('.html')) return this.visitHtmlFile(ref, opts);
        else {
            opts = {basedir: path.dirname(fn), ...opts};
            for (let cmplr of this.env.compilers) {
                if (cmplr.match(fn)) {
                    var c = cmplr.compileFile(fn)
                    return this.visitModuleRef(c, opts);
                }
            }
            throw new Error(`no compiler for '${fn}'`);
        }
    }

    visitJSFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        return this.visitJS(AcornJSModule.fromSourceFile(ref).in(this.env), opts);
    }

    visitCSSFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        return this.visitCSS(PostCSSModule.fromSourceFile(ref));
    }

    visitJSONFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        var pt = JsonModule.fromSourceFile(ref);
        return {compiled: pt, deps: []};
    }

    visitHtmlFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        return this.visitHtml(HtmlModule.fromSourceFile(ref).in(this.env), opts);
    }

    visitJS(m: AcornJSModule, opts: VisitOptions = {}): VisitResult {
        var sp = SearchPath.from(opts.basedir || m.dir);

        if (m.isLoose) this.env.report.warn(null, "module parsed loosely due to syntax errors.");

        var lookup = (u: acorn.Node, src: string) => {
            if (m.isExternalRef(u)) return new NodeModule(src);
            if (src.startsWith('*')) return new SourceFile(src.slice(1)); /** @oops */
            try {
                /** @todo This setting will prioritized substitute modules, then
                 * locally installed modules, then intrinsic modules.
                 *  Is it ok? Should this be configurable? */
                return this.modules.substitute.get(src) || sp.lookup(src);
            }
            catch (e) {
                return this.modules.intrinsic.get(src) 
                       || new StubModule(src, 'js', e);
            }
        };
        var mkdep = (u: acorn.Node, target: ModuleRef) => ({source: u, target});

        m.extractImports();
        var deps = m.imports.map(u => mkdep(u, lookup(u, u.source.value)))
            .concat(m.requires.map(u => mkdep(u, lookup(u, u.arguments[0].value))))
            .concat(m.exportsFrom.map(u => mkdep(u, lookup(u, u.source.value))));
        return {compiled: m, deps};
    }

    visitHtml(m: HtmlModule, opts: VisitOptions = {}): VisitResult {
        var dir = opts.basedir || m.dir, sp = new SearchPath([dir], [dir]);

        var lookup = (src: string) => {
            try       { return sp.lookup(src); }
            catch (e) { return new StubModule(src, 'html', e); }
        };
        var mkdep = <T>(u: T, target: ModuleRef) => ({source: u, target});

        var deps = m.getRefTags().map(({path, tag}) => mkdep(tag, lookup(path)));
        return {compiled: m, deps};
    }

    visitCSS(m: PostCSSModule, opts: VisitOptions = {}): VisitResult {
        var dir = opts.basedir || m.dir, sp = new SearchPath([dir], [dir]);

        var lookup = (src: string) => {
            try       { return sp.lookup(src); }
            catch (e) { return new StubModule(src, 'css', e); }
        };
        var mkdep = <T>(u: T, target: ModuleRef) => ({source: u, target});

        m.extractUrls();
        var deps = m.localUrls.map(loc => mkdep(loc, lookup(loc.url)));
        return {compiled: m, deps};
    }

    visitModuleRef(ref: ModuleRef, opts: VisitOptions = {}): VisitResult {
        if (ref instanceof PackageDir) return this.visitPackageDir(ref, opts);
        else if (ref instanceof SourceFile) return this.visitSourceFile(ref, opts);
        else if (ref instanceof TransientCode) return this.visitTransientCode(ref, opts);
        else if (ref instanceof BinaryAsset) return this.visitBinaryAsset(ref);
        else if (ref instanceof GroupedModules) return this.visitGroupedModules(ref, opts);
        else if (ref instanceof StubModule || ref instanceof NodeModule)
            return this.visitLeaf(ref);
        else throw new Error(`cannot visit: ${ref.constructor.name}`);
    }

    visitSourceFile(ref: SourceFile, opts: VisitOptions = {}): VisitResult {
        this.env.report.visit(ref);
        return {...this.safely(ref, '?', ref.filename, () => this.visitFile(ref, opts)),
                origin: ref};
    }

    visitPackageDir(ref: PackageDir, opts: VisitOptions = {}): VisitResult {
        try {
            return this.visitModuleRef(ref.getMain(), opts);
        }
        catch (e) {
            return this.visitLeaf(new StubModule(ref.canonicalName, 'js', e));
        }
    }

    visitTransientCode(ref: TransientCode, opts: VisitOptions = {}): VisitResult {
        return this.safely(ref, '<transient>', ref.contentType, () => {
        switch (ref.contentType) {
            case 'js':
                return this.visitJS(
                    new AcornJSModule(ref.content).in(this.env), opts);
            case 'css':
                return this.visitCSS(new PostCSSModule(ref.content), opts);
            default:
                /** @oops all non-JS functionality is essentially duplicated here */
                var fn = path.join(opts.basedir || '.',
                                ref.filename || `transient.${ref.contentType}`);
                for (let cmplr of this.env.compilers) {
                    if (cmplr.match(fn)) {
                        var c = cmplr.compileSource(ref.content, fn)
                        return this.visitModuleRef(c, opts);
                    }
                }
                throw new Error(`cannot visit TransientCode(..., contentType='${ref.contentType}')`);
            }
        });
    }

    visitBinaryAsset(ref: BinaryAsset, opts: VisitOptions = {}): VisitResult {
        return {origin: ref, compiled: new PassThroughModule(ref.content, ref.contentType), deps: []};
    }

    visitGroupedModules(ref: GroupedModules, opts: VisitOptions = {}): VisitResult {
        /** @todo use companions in dependency resolution */
        return this.visitModuleRef(ref.main, opts);
    }

    visitLeaf(ref: NodeModule | StubModule): VisitResult {
        let compiled = (ref instanceof StubModule && ref.context == 'js') ?
            new StubJSModule('module stub') : null;
        return {origin: ref, compiled, deps: []};
    }
}


type VisitOptions = {basedir?: string}
type VisitResult = {origin?: ModuleRef, compiled: CompilationUnit, deps: ModuleDependency[]}


namespace TextSource {
    /**
     * Returns `true` if the spans share a line
     */
    export function areOnSameLine(inp: string,
                    at1: {start: number, end: number}, 
                    at2: {start: number, end: number}) {
        if (at2.start > at1.end) {
            return !inp.substring(at2.start, at1.end).includes('\n')
        }
        else return false; /** @todo */
    }
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



export { AcornCrawl, SearchPath, VisitOptions, VisitResult, TextSource }