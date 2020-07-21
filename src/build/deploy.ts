const fs = (0||require)('fs') as typeof import('fs'),   // use native fs
      mkdirp = (0||require)('mkdirp') as typeof import('mkdirp'),
      findUp = (0||require)('find-up');
import path from 'path';
import assert from 'assert';
import * as parse5 from 'parse5';
import { ModuleRef, PackageDir, SourceFile, StubModule, NodeModule,
         ModuleDependency } from './modules';
import { InEnvironment, VisitResult, CompilationUnit, PassThroughModule,
         HtmlModule, ConcatenatedJSModule } from './bundle';



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


class Deployment extends InEnvironment {
    outDir: string
    files: Set<string> = new Set
    modules: {dmod: DeployModule, targets: SourceFile[]}[] = []
    include: SourceFile[]

    constructor(outDir: string) { super(); this.outDir = outDir; }

    add(dmod: DeployModule) {
        var fls = this._isDelayed(dmod) ? [] : this.write(dmod);
        this.modules.push({dmod, targets: fls});
        return fls;
    }

    addVisitResult(vis: VisitResult) {
        this.add(new DeployModule(vis.origin.normalize(), vis.compiled, vis.deps));
    }

    addInclude(fn: string = 'src/build/include.js') {
        var cwd = typeof __dirname !== 'undefined' ? __dirname : '.',
            ref = new SourceFile(findUp.sync(fn, {cwd}), null, 'js'),
            ptm = PassThroughModule.fromSourceFile(ref);
        this.include = this.write(new DeployModule(ref, ptm, []));
    }

    newFilename(filename: string, contentType: string) {
        var ext = `.${contentType}`,
            basename = this.withoutExt(filename, ext);
        function *candidates() {
            yield basename;
            for (let i = 0; ; i++) yield `${basename}-${i}`;
        }
        for (let cand of candidates()) 
            if (!this.files.has(filename = this.withExt(cand, ext))) break;
        this.files.add(filename);
        return filename;
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
            this.writeFileSync(this.newFilename(outfn, contentType), body, contentType));
    }

    writeFileSync(filename: string, content: string, contentType?: string) {
        var outp = path.join(this.outDir, filename);
        this.env.report.deploy(outp);
        mkdirp.sync(path.dirname(outp));
        fs.writeFileSync(outp, content);
        this.files.add(filename);
        return new SourceFile(outp, null, contentType);
    }

    wrapUp(entries: {input: ModuleRef[], output: string}[]) {
        return [...this.wrapUpIter(entries)];
    }

    *wrapUpIter(entries: {input: ModuleRef[], output: string}[]) {
        for (let entry of entries) {
            if (entry.output.endsWith('.html'))
                yield this.makeEntryHtml(entry.input[0] as SourceFile, entry.output);
            else
                yield this.makeEntryJS(entry.input, entry.output);
        }
    }

    makeEntryHtml(entry: SourceFile, outputFilename: string) {
        if (!this.include) this.addInclude();

        var html = HtmlModule.fromSourceFile(entry).in(this.env),
            deps = new HtmlPostprocessor(this, html).getDeps();

        return this.writeFileSync(outputFilename, html.process(outputFilename, deps));
    }

    makeEntryJS(entry: ModuleRef[], outputFilename: string) {
        if (!this.include) this.addInclude();

        var cjs = new ConcatenatedJSModule().in(this.env),
            deps = new ConcatenatedJSPostprocessor(this, cjs, entry).getDeps();

        return this.writeFileSync(outputFilename, cjs.process(outputFilename, deps));
    }

    /**
     * Some modules can only be processed after all the others have finished
     * (concatenated JS, main HTML).
     */
    _isDelayed(dmod: DeployModule) {
        return dmod.compiled && dmod.compiled.contentType == 'html';
    }

    _relative(target: SourceFile) {
        return Deployment._relative(this.outDir, target);
    }

    _kindOf(input: ModuleRef) {
        return input instanceof SourceFile ? input.contentType : undefined;
    }

    static _relative(from: string, target: SourceFile) {
        return new SourceFile(path.relative(from, target.filename),
                              target.package, target.contentType);
    }
}


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
        this.scripts = unit.getRefTags();
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
        const mid = m.id;
        return this.entryPoints.some(x => x.id === mid) ? {} : undefined;
    }

    _targets(targets: SourceFile[]) { return targets; }
}


export { DeployModule, Deployment }
