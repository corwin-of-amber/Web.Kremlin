import fs from 'fs';            /* @kremlin.native */
import path from 'path';
import assert from 'assert';

import findUp from 'find-up';   /* @kremlin.native */
import * as parse5 from 'parse5';

import { CaseInsensitiveSet } from '../infra/keyed-collections';
import { TargetDefinition } from '../project';
import { InEnvironment } from './environment';
import { ModuleRef, PackageDir, SourceFile, StubModule, NodeModule,
         BinaryAsset, ModuleDependency, TransientCode} from './modules';
import { CompilationUnit } from './compilation-unit';
import { VisitResult } from './bundle';
import { PassThroughModule, ConcatenatedJSModule } from './loaders/basic';
import { AcornJSModule } from './loaders/js';
import { HtmlModule } from './loaders/html';



class DeployModule {
    ref: ModuleRef
    compiled: CompilationUnit
    deps: ModuleDependency[]
    output?: Output[]

    constructor(ref: ModuleRef, compiled: CompilationUnit, deps: ModuleDependency[]) {
        this.ref = ref;
        this.compiled = compiled;
        this.deps = deps;
    }

    get targets(): {body: () => string | Uint8Array, contentType: string}[] {
        if (this.compiled) {
            let key = this.ref instanceof TransientCode ? undefined : this.ref.canonicalName;
            return [{body: () => this.compiled.process(key, this.deps),
                     contentType: this.compiled.contentType}];
        }
        else
            return [];
    }

    get filename(): string {
        if (this.ref instanceof PackageDir)
            assert(0);
        else if (this.ref instanceof SourceFile || this.ref instanceof TransientCode)
            return path.basename(this.ref.filename ?? 'transient');
        else if (this.ref instanceof StubModule || this.ref instanceof NodeModule)
            return path.join('stubs', this.ref['name']);
    }
}


class Deployment extends InEnvironment {
    outDir: string
    files: Set<string> = new CaseInsensitiveSet
    modules: {dmod: DeployModule, outputs: Output[]}[] = []
    include: Output
    globals: Map<string, ModuleRef> = new Map
    bundle: {js?: Output, css?: Output} = {}

    constructor(outDir: string) { super(); this.outDir = outDir; }

    add(dmod: DeployModule) {
        var outputs = this.prewrite(dmod);
        this.modules.push({dmod, outputs});
        return outputs;
    }

    addVisitResult(vis: VisitResult) {
        //console.log(vis)
        this.add(new DeployModule(vis.origin.normalize(),
                                  vis.compiled, vis.deps));
        for (let [k, v] of vis.globals?.entries() ?? []) {
            this.env.report.info(v, `is used for global '${k}'`);
            this.globals.set(k, v);
        }
    }

    addAsset(asset: SourceFile) {
        var ptm = PassThroughModule.fromSourceFile(asset, 'plain');
        this.write(new DeployModule(asset, ptm, []));
    }

    addInclude(fn: string = 'src/build/include.js') {
        var cwd = typeof __dirname !== 'undefined' ? __dirname : '.',
            ref = new SourceFile(findUp.sync(fn, {cwd}), null, 'js'),
            ptm = PassThroughModule.fromSourceFile(ref);
        this.include = this._single(this.write(new DeployModule(ref, ptm, [])));
    }

    newFilename(filename: string, contentType: string) {
        var ext = '', basename = filename;
        if (!Deployment.NOEXT.includes(contentType)) {
            ext = `.${contentType}`;
            basename = this.withoutExt(filename, ext);
        }
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

    prewrite(dmod: DeployModule) {
        console.log(dmod);
        var outfn = dmod.filename;
        dmod.output ??= dmod.targets.map(({body, contentType}) =>
            new SourceFile(path.join(this.outDir, this.newFilename(outfn, contentType)), null, contentType));
        return dmod.output;
    }

    write(dmod: DeployModule) {
        if (!dmod.output) this.prewrite(dmod);
        var targets = dmod.targets, output = dmod.output;
        assert(targets.length <= (output?.length ?? 0));
        for (let i = 0; i < targets.length; i++) {
            this.writeFileSync(output[i].filename, targets[i].body(), targets[i].contentType);
        }
        return dmod.output;
    }

    writeFileSync(filepath: string, content: string | Uint8Array, contentType?: string) {
        if (this.env.cache.out.update(filepath, content)) {
            this.env.report.deploy(filepath);
            fs.mkdirSync(path.dirname(filepath), {recursive: true});
            fs.writeFileSync(filepath, content);
        }
        return new SourceFile(filepath, null, contentType);
    }

    writeOutput(filename: string, content: string | Uint8Array, contentType?: string) {
        this.files.add(filename);
        var filepath = path.join(this.outDir, filename);
        return this.writeFileSync(filepath, content, contentType);
    }

    flush() {
        for (let {dmod} of this.modules) {
            if (!this._isDelayed(dmod)) {
                this._adjustDeps(dmod);
                this.write(dmod);
            }
        }
    }

    _adjustDeps(dmod: DeployModule) {
        for (let dep of dmod.deps ?? []) {
            for (let other of this.modules) {
                if (dep.target.id === other.dmod.ref.id)
                    dep.deployed = other.dmod.output.map(out => path.basename(out.filename));
            }
        }
    }

    _single<T>(a: T[]) {
        assert(a.length === 1);
        return a[0];
    }

    /**
     * Concatenates all JS modules so that they can be included in a single `<script>`
     * tag.
     */
    squelch(entry: ModuleRef[], outputFilename = 'bundle.js') {
        this.flush();
        this.bundle.js = this.makeEntryJS(entry, outputFilename);
    }

    wrapUp(entries: TargetDefinition[]) {
        this.flush();
        return [...this.wrapUpIter(entries)];
    }

    *wrapUpIter(entries: TargetDefinition[]) {
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

        html.outDir = this.outDir;

        return this.writeOutput(outputFilename,
            html.process(outputFilename, deps, this.globals), 'html');
    }

    makeEntryJS(entry: ModuleRef[], outputFilename: string) {
        if (!this.include) this.addInclude();

        var cjs = new ConcatenatedJSModule().in(this.env),
            deps = new ConcatenatedJSPostprocessor(this, cjs, entry).getDeps();

        cjs.outDir = this.outDir;

        return this.writeOutput(outputFilename,
            cjs.process(outputFilename, deps, this.globals), 'js');
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
                              target.inDir, target.contentType);
    }

    static NOEXT = ['plain', 'application/octet-stream'];
}


type Output = SourceFile | BinaryAsset;


/**
 * @todo not so sure about the naming and concept of this class hierarchy
 */
class Postprocessor<CU extends CompilationUnit, R> {
    deploy: Deployment
    unit: CU

    constructor(deploy: Deployment, unit: CU) {
        this.deploy = deploy;
        this.unit = unit;
    }

    getDeps(): ModuleDependency[] {
        return [
            this.incDep(this.deploy.include),
            ...this.mkDeps_(this.deploy.modules)
        ].filter(x => x);
    }

    incDep(output: Output) {
        return output && {
            source: undefined, target: undefined,
            compiled: [output]
        };
    }

    mkDeps_(ms: {dmod: DeployModule, outputs: Output[]}[]) {
        return ms.map(({dmod, outputs}) => this.mkDep(dmod, outputs));
    }

    mkDeps(dmods: DeployModule[]) {
        return dmods.filter(x => x).map(dmod => this.mkDep(dmod));
    }

    mkDep(dmod: DeployModule, outputs?: Output[]): ModuleDependency {
        return {
            source: this.referenceOf(dmod),
            target: dmod.ref,
            compiled: dmod.output ?? outputs  /** @todo need `outputs`? */
        }
    }

    referenceOf(ref: DeployModule): R { return undefined; }
}


/**
 * An auxiliary class for injecting scripts into HTML files.
 */
class HtmlPostprocessor extends Postprocessor<HtmlModule, HtmlRef> {

    scripts: {path: string, tag: parse5.DefaultTreeElement}[]

    constructor(deploy: Deployment, unit: HtmlModule) {
        super(deploy, unit);
        this.scripts = unit.getRefTags();

        if (this.deploy.bundle.js)
            unit.inlineScripts = false;  /** @todo what about stubs though (e.g. for CSS deps) */
    }

    getDeps(): ModuleDependency[] {
        return this.deploy.bundle.js ?
            [
                this.incDep(this.deploy.include),
                ...this.mkDeps_(this.deploy.modules).map(d => this.nonJS(d)),
                this.incDep(this.deploy.bundle.js)
            ].filter(x => x) : super.getDeps();
    }

    /**
     * Omits JS outputs from dependencies; used when JS compilation
     * units have been bundled.
     */
    nonJS(d: ModuleDependency) {
        let isJS = (mod: any) => mod.contentType === 'js';
        return {...d, compiled: d.compiled?.filter(x => !isJS(x))};
    }

    referenceOf(m: DeployModule): HtmlRef {
        /** @todo this is too brittle */
        if (m.ref instanceof TransientCode) return undefined;
        var cn = m.ref.canonicalName,
            lu = this.scripts.find(({path}) => cn.endsWith(path));
        return lu && lu.tag;
    }
}

type HtmlRef = parse5.DefaultTreeElement;


class ConcatenatedJSPostprocessor extends Postprocessor<ConcatenatedJSModule, AcornJSModule> {

    entryPoints: ModuleRef[]

    constructor(deploy: Deployment, unit: ConcatenatedJSModule, entryPoints: ModuleRef[]) {
        super(deploy, unit);
        this.entryPoints = entryPoints;
    }

    referenceOf(m: DeployModule): AcornJSModule {
        const mid = m.ref.id;
        return m.compiled instanceof AcornJSModule && 
               this.entryPoints.some(x => x.id === mid) ? m.compiled : undefined;
    }
}


export { DeployModule, Deployment }
