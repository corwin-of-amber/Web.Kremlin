const fs = (0||require)('fs'),   // use native fs
      mkdirp = (0||require)('mkdirp'),
      findUp = (0||require)('find-up');
import path from 'path';
import assert from 'assert';
import { ModuleRef, PackageDir, SourceFile, StubModule, NodeModule,
         ModuleDependency, CompilationUnit, PassThroughModule,
         VisitResult, HtmlModule} from './bundle';



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

    html: CompilationUnit

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

    makeIndexHtml(entry?: ModuleRef) {
        if (!this.include) this.addInclude();
        var filename = this.newFilename('bundled.html', 'html'),
            targets = this.include.concat(...this.modules.map(m => m.targets))
                      .map(sf => this._relative(this.outDir, sf)),
            init = entry ? this._initScript(entry) : '';
        return this.writeFileSync(filename, this._htmlWith(filename, targets) + init);
    }

    _relative(from: string, target: SourceFile) {
        return new SourceFile(path.relative(from, target.filename), target.package);
    }

    _htmlWith(filename: string, targets: ModuleRef[]) {
        var html = this.html || new HtmlModule(DEFAULT_HTML);
        return html.process(filename, targets.map(target => ({target, reference: undefined})));
    }

    _initScript(ref: ModuleRef) {
        var key = ref.normalize().canonicalName;
        return `\n<script>kremlin.require('${key}');</script>`;
    }
}


const DEFAULT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head></html>`;



export { DeployModule, Deployment }
