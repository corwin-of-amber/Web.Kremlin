const fs = (0||require)('fs') as typeof import('fs'),   // use native fs
      path = (0||require)('path') as typeof import('path'),
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
    parent?: PackageDir
    constructor(dir: string, parent?: PackageDir) {
        super();
        this.dir = dir;
        this.parent = parent || PackageDir.lookUp(dir);
    }
    get canonicalName() {
        var m = this.manifest;
        return m.name && m.version ? `${m.name}@${m.version}` :
               this.parent ? `${this.parent.canonicalName}:${path.relative(this.parent.dir, this.dir)}`
                           : this.dir;
    }
    get manifest() {
        try {
            var jsonFn = path.join(this.dir, 'package.json');
            return fs.existsSync(jsonFn) ?
                JSON.parse(fs.readFileSync(jsonFn, 'utf-8')) : {};
        }
        catch (e) {
            console.error(`failed to read manifest in ${this.dir}`, e);
            return {}; 
        }
    }
    get(filename: string) {
        var sf = this.getIfExists(filename);
        if (!sf) throw new FileNotFound(filename, [this.dir]);
        return sf;
    }
    getIfExists(filename: string) {
        var fn = path.join(this.dir, filename);
        if (fs.existsSync(fn)) return new SourceFile(fn, this);
    }
    getMain(): SourceFile {
        for (let candidate of [this.manifest.main, 'index.js', 'index.ts'].filter(x => x)) {
            var sf = this.getIfExists(candidate);
            if (sf) return sf;
        }
        throw new MainFileNotFound(this);
    }
    normalize(): SourceFile {
        return this.getMain();
    }

    static lookUp(from: string): PackageDir {
        var cwd = path.dirname(from),
            fu = findUp.sync(['package.json', 'node_modules'], {cwd});
        if (fu) return new PackageDir(path.dirname(fu));
    }
}

class SourceFile extends ModuleRef {
    filename: string
    package?: PackageDir
    constructor(filename: string, pkg?: PackageDir) {
        super();
        this.filename = filename;
        this.package = pkg || PackageDir.lookUp(path.dirname(this.filename));
    }
    get id() { return JSON.stringify([this.constructor.name, this.filename]); };
    get canonicalName() {
        return this.package ? `${this.package.canonicalName}:${path.relative(this.package.dir, this.filename)}`
             : this.filename;
    }
    readSync() { return fs.readFileSync(this.filename, 'utf-8'); }
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

class FileNotFound extends ModuleResolutionError {
    path: string
    from: string[]

    constructor(path: string, from: string[]) {
        super();
        this.path = path;
        this.from = from;
    }
}

class MainFileNotFound extends ModuleResolutionError {
    pkg: PackageDir

    constructor(pkg: PackageDir) {
        super();
        this.pkg = pkg;
    }
}



export { ModuleRef, SourceFile, PackageDir, TransientCode, NodeModule, StubModule,
         ModuleDependency, ModuleResolutionError, FileNotFound }