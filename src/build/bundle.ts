import path from 'path';  /* @kremlin.native */

import * as acorn from 'acorn';
import { Environment, InEnvironment } from './environment';
import { ModuleRef, SourceFile, PackageDir, TransientCode, GroupedModules,
         NodeModule, StubModule, ModuleDependency, BinaryAsset } from './modules';
import { SearchPath } from './search-path';
import { CompilationUnit } from './compilation-unit';
import { PassThroughModule, JsonModule } from './loaders/basic';
import { AcornJSModule, StubJSModule } from './loaders/js';
import { HtmlModule } from './loaders/html';
import { PostCSSModule } from './loaders/css';



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
        if (ref.package) {
            opts = {basedir: SearchPath.cursorAt(ref), ...opts};
        }
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
            if (src.startsWith('*')) return new SourceFile(src.slice(1)); // special ref for companion modules in grouped
            try {
                /** @todo This setting will prioritize substitute modules, then
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

        /* Process global dependencies such as `Buffer` */
        let globdeps = m.detectGlobalDependencies(),
            globals: GlobalDependencies = new Map;
        for (let {u, modname, name} of globdeps) {
            let mod = lookup(u, modname);
            if (!(mod instanceof StubModule)) {
                deps.push(mkdep(u, mod));
                globals.set(name, mod);
            }
        }

        if (globals.size === 0) globals = undefined;

        return {compiled: m, deps, globals};
    }

    visitHtml(m: HtmlModule, opts: VisitOptions = {}): VisitResult {
        var sp = SearchPath.fromExact(opts.basedir || m.dir);

        var lookup = (src: string) => {
            try       { return sp.lookup(src); }
            catch (e) { return new StubModule(src, 'html', e); }
        };
        var mkdep = <T>(u: T, target: ModuleRef) => ({source: u, target});

        var deps = m.getRefTags().map(({path, tag}) => mkdep(tag, lookup(path)));
        return {compiled: m, deps};
    }

    visitCSS(m: PostCSSModule, opts: VisitOptions = {}): VisitResult {
        var sp = SearchPath.fromExact(opts.basedir || m.dir);

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
                /** @oops all non-JS functionality from `visitFile` is essentially duplicated here */
                var fn = path.join(SearchPath.DirCursor.demote(opts.basedir || '.'),
                                   ref.filename || `transient.${ref.contentType}`);
                for (let cmplr of this.env.compilers) {
                    if (cmplr.match(fn)) {
                        var c = cmplr.compileSource(ref.content, fn)
                        return this.visitModuleRef(c, opts);
                    }
                }
                throw new Error(`cannot visit TransientCode(..., contentType='${ref.contentType}'):`+
                                ` no compiler for this content type`);
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


type VisitOptions = {basedir?: string | SearchPath.DirCursor}
type VisitResult = {
    origin?: ModuleRef
    compiled: CompilationUnit
    deps: ModuleDependency[]
    globals?: GlobalDependencies
}

type GlobalDependencies = Map<string, ModuleRef>


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



export { AcornCrawl, VisitOptions, VisitResult, GlobalDependencies, TextSource }