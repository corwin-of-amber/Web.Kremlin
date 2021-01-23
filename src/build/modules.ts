const fs = (0||require)('fs') as typeof import('fs'),   // use native fs
      path = (0||require)('path') as typeof import('path'),
      findUp = (0||require)('find-up');

import { Environment, InEnvironment } from './environment';



abstract class ModuleRef extends InEnvironment {
    get id() {
        return JSON.stringify([this.constructor.name, Object.assign({}, this)]);
    }
    abstract get canonicalName(): string
    normalize(): ModuleRef { return this; }
}

class PackageDir extends ModuleRef {
    dir: string
    parent?: PackageDir
    manifestFile: SourceFile

    constructor(dir: string, parent?: PackageDir) {
        super();
        this.dir = dir;
        this.parent = parent || PackageDir.lookUp(dir);
        this.manifestFile = this.getIfExists('package.json');
    }
    get id() { return JSON.stringify([this.constructor.name, this.dir]); };
    get canonicalName() {
        var m = this.manifest;
        return m.name && m.version ? `${m.name}@${m.version}` :
               this.parent ? `${this.parent.canonicalName}:${path.relative(this.parent.dir, this.dir)}`
                           : this.dir;
    }
    get manifest() {
        try {
            return this.manifestFile ?
                JSON.parse(this.manifestFile.readSync()) : {};
        }
        catch (e) {
            this.env.report.error(this, 
                `failed to read manifest in ${this.dir}; ${e}`);
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
        return this.env.policy.packageEntryPoint(this);
    }
    normalize(): SourceFile | PackageDir {
        try { return this.getMain(); } catch { return this; }
    }

    static lookUp(from: string): PackageDir {
        var cwd = path.dirname(from),
            fu = findUp.sync(['package.json', 'node_modules'], {cwd});
        if (fu) return new PackageDir(path.dirname(fu));
    }
}

class SourceFile extends ModuleRef {
    filename: string
    contentType?: string
    package?: PackageDir
    constructor(filename: string, pkg?: PackageDir, contentType?: string) {
        super();
        this.filename = filename;
        this.contentType = contentType;
        this.package = pkg || PackageDir.lookUp(this.filename);
    }
    get id() { return JSON.stringify([this.constructor.name, this.filename]); };
    get canonicalName() {
        var pkg = this.package;
        while (pkg && !pkg.manifestFile) pkg = pkg.parent;
        return pkg ? `${pkg.canonicalName}:${path.relative(pkg.dir, this.filename)}`
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

class ShimModule extends ModuleRef {
    name: string
    subst: ModuleRef
    constructor(name: string, subst: ModuleRef) {
        super();
        this.name = name;
        this.subst = subst;
    }
    get id() { return JSON.stringify([this.constructor.name, this.name]); };
    get canonicalName() { return `shim://${this.name}`; }
    normalize() { return this.subst.normalize(); }

    in(env: Environment) { this.subst = this.subst.in(env); return super.in(env); }
}

class StubModule extends ModuleRef {
    name: string
    reason: ModuleResolutionError
    constructor(name: string, reason: ModuleResolutionError)
    { super(); this.name = name; this.reason = reason; }
    get id() { return JSON.stringify([this.constructor.name, this.name]); };
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



export { ModuleRef, SourceFile, PackageDir, TransientCode, NodeModule,
         ShimModule, StubModule, ModuleDependency,
         ModuleResolutionError, FileNotFound, MainFileNotFound }