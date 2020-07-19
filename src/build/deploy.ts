const fs = (0||require)('fs') as typeof import('fs'),   // use native fs
      mkdirp = (0||require)('mkdirp') as typeof import('mkdirp'),
      findUp = (0||require)('find-up');
import path from 'path';
import assert from 'assert';
import * as parse5 from 'parse5';
import { ModuleRef, PackageDir, SourceFile, StubModule, NodeModule,
         ModuleDependency } from './modules';
import { CompilationUnit, PassThroughModule, HtmlModule, VisitResult, ConcatenatedJSModule }
         from './bundle';



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
    modules: {dmod: DeployModule, targets: SourceFile[]}[] = []
    include: SourceFile[]

    html: HtmlModule

    constructor(outDir: string) { this.outDir = outDir; }

    add(dmod: DeployModule) {
        var fls = this.write(dmod);
        this.modules.push({dmod, targets: fls});
        return fls;
    }

    addVisitResult(vis: VisitResult) {
        this.add(new DeployModule(vis.origin.normalize(), vis.compiled, vis.deps));
    }

    addInclude(fn: string = 'src/build/include.js') {
        var ref = new SourceFile(findUp.sync(fn, {cwd: __dirname})),
            ptm = PassThroughModule.fromSourceFile(ref);
        this.include = this.write(new DeployModule(ref, ptm, []));
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

    write(dmod: DeployModule) {
        var outfn = dmod.output;
        return dmod.targets.map(({body, contentType}) =>
            this.writeFileSync(this.newFilename(outfn, contentType), body));
    }

    writeFileSync(filename: string, content: string) {
        var outp = path.join(this.outDir, filename);
        console.log(`%c> ${outp}`, "color: #ff8080");
        mkdirp.sync(path.dirname(outp));
        fs.writeFileSync(outp, content);
        this.files.add(filename);
        return new SourceFile(outp);
    }

    makeIndexHtml(filename?: string) {
        if (!this.include) this.addInclude();
        filename = filename || this.newFilename('bundled.html', 'html');
        return this.writeFileSync(filename, this._htmlWith(filename));
    }

    concatenateJS(filename: string, entry: ModuleRef[]) {
        var cjs = new ConcatenatedJSModule(),
            deps = new ConcatenatedJSPostprocessor(this, cjs, entry).getDeps();

        return this.writeFileSync(filename, cjs.process(filename, deps));
    }

    _relative(target: SourceFile) {
        return Deployment._relative(this.outDir, target);
    }

    static _relative(from: string, target: SourceFile) {
        return new SourceFile(path.relative(from, target.filename), target.package);
    }

    _htmlWith(filename: string) {
        var html = this.html || new HtmlModule(DEFAULT_HTML),
            deps = new HtmlPostprocessor(this, html).getDeps();
        
        return html.process(filename, deps);
    }
}


const DEFAULT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head></html>`;


class Postprocessor<CU extends CompilationUnit, R> {
    deploy: Deployment
    unit: CU

    constructor(deploy: Deployment, unit: CU) {
        this.deploy = deploy;
        this.unit = unit;
    }

    getDeps(): ModuleDependency[] {
        var pre = this.deploy.include ? [{
                source: undefined, target: undefined, 
                compiled: this._targets(this.deploy.include)
            }] : [],
            load = this.deploy.modules.map(m => ({
                source: this.referenceOf(m.dmod.ref), target: m.dmod.ref,
                compiled: this._targets(m.targets)
            }));
        return pre.concat(load);
    }    

    referenceOf(ref: ModuleRef): R { return undefined; }

    _targets(targets: SourceFile[]) {
        return targets.map(t => this.deploy._relative(t));
    }
}


/**
 * An auxiliary class for injecting scripts into HTML files.
 */
class HtmlPostprocessor extends Postprocessor<HtmlModule, HtmlRef> {

    scripts: {path: string, tag: parse5.DefaultTreeElement}[]

    constructor(deploy: Deployment, unit: HtmlModule) {
        super(deploy, unit);
        this.scripts = HtmlPostprocessor.getRefTags(this.unit);
    }

    static getRefTags(html: HtmlModule) {
        if (!html.scripts) html.extractScripts();
        return html.scripts.map(sc => {
            var src = sc.attrs.find(a => a.name == 'src');
            if (src) {
                var mo = /^kremlin:\/\/(.*)$/.exec(src.value);
                if (mo) return {path: mo[1], tag: sc};
            }
        }).filter(x => x);
    }

    referenceOf(m: ModuleRef): HtmlRef {
        var cn = m.canonicalName,
            lu = this.scripts.find(({path}) => cn.endsWith(path));
        return lu && lu.tag;
    }
}

type HtmlRef = parse5.DefaultTreeElement;


class ConcatenatedJSPostprocessor extends Postprocessor<ConcatenatedJSModule, {}> {

    entryPoints: ModuleRef[]

    constructor(deploy: Deployment, unit: ConcatenatedJSModule, entryPoints: ModuleRef[]) {
        super(deploy, unit);
        this.entryPoints = entryPoints;
    }

    referenceOf(m: ModuleRef): {} {
        return this.entryPoints.includes(m) ? {} : undefined;
    }

    _targets(targets: SourceFile[]) { return targets; }
}


export { DeployModule, Deployment }
