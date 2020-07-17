const fs = (0||require)('fs'),   // use native fs
      path = (0||require)('path'),
      findUp = (0||require)('find-up');



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
    get canonicalName() {
        var m = this.manifest;
        return m.name && m.version ? `${m.name}@${m.version}` : this.dir; 
    }
    get manifest() {
        try {
            var m = fs.readFileSync(path.join(this.dir, 'package.json'));
            return JSON.parse(m);
        }
        catch (e) {
            console.error(`failed to read manifest in ${this.dir}`, e);
            return {}; 
        }
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
    get id() { return JSON.stringify([this.constructor.name, this.filename]); };
    get canonicalName() {
        return this.package ? `${this.package.canonicalName}:${path.relative(this.package.dir, this.filename)}`
             : this.filename;
    }
    readSync() { return fs.readFileSync(this.filename, 'utf-8'); }
    normalize() {
        if (!this.package) {
            var cwd = path.dirname(this.filename),
                fu = findUp.sync(['package.json', 'node_modules'], {cwd});
            if (fu) this.package = new PackageDir(path.dirname(fu));
        }
        return this;
    }
}

class TransientCode extends ModuleRef {
    contentType: string
    content: string
    constructor(content: string, contentType: string) {
        super();
        this.contentType = contentType;
        this.content = content;
    }
    get canonicalName(): string { throw new Error('Internal error: TransientCode#canonicalName'); }
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

type ModuleDependency<T = any> = 
    {source: T, target: ModuleRef, compiled?: ModuleRef[]};


class ModuleResolutionError { }



export { ModuleRef, SourceFile, PackageDir, TransientCode, NodeModule, StubModule,
         ModuleDependency, ModuleResolutionError }