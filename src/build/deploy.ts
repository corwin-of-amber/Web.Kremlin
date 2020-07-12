const fs = (0||require)('fs'),   // use native fs
      mkdirp = (0||require)('mkdirp');
import path from 'path';
import assert from 'assert';
import { ModuleRef, PackageDir, SourceFile, StubModule, NodeModule,
         ModuleDependency, CompilationUnit, PassThroughModule,
         VisitResult } from './bundle';



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

    constructor(outDir: string) { this.outDir = outDir; }

    add(dmod: DeployModule) {
        var fls = this.write(dmod);
        this.modules.push({dmod, targets: fls});
        return fls;
    }

    addVisitResult(vis: VisitResult) {
        this.add(new DeployModule(vis.origin.normalize(), vis.compiled, vis.deps));
    }

    addInclude() {
        var ref = new SourceFile('src/build/include.js'),
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

    makeIndexHtml() {
        if (!this.include) this.addInclude();
        var targets = this.include.concat(...this.modules.map(m => m.targets)),
            tags = targets.map(sf => this.makeIncludeTag(sf)),
            html = `<!DOCTYPE html><html><head><meta charset="utf-8">${tags.join('\n')}
                    </head></html>`;
        return this.writeFileSync(this.newFilename('bundled.html', 'html'), html);
    }

    makeIncludeTag(m: SourceFile) {
        var relfn = path.relative(this.outDir, m.filename);
        return `<script src="${relfn}"></script>`;
    }
}



export { DeployModule, Deployment }
