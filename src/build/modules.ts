const fs = (0||require)('fs') as typeof import('fs'),   // use native fs
      path = (0||require)('path') as typeof import('path'),
      findUp = (0||require)('find-up');

import { Environment } from './environment';



abstract class ModuleRef {
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
        this.manifestFile = this.getIfExists('package.json') as SourceFile; /** @oops */
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
            Environment.get().report.error(this, 
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
        try {
            var stat = fs.statSync(fn);
            return stat.isDirectory() ? 
                new PackageDir(fn, this) : new SourceFile(fn, this);
        }
        catch { return undefined; }
    }
    getMain(): SourceFile {
        return Environment.get().policy.packageEntryPoint(this);
    }
    normalize(): SourceFile | PackageDir {
        try { return this.getMain(); } catch { return this; }
    }

    static lookUp(from: string): PackageDir {
        var cwd = path.dirname(from),
            fu = findUp.sync(['package.json', 'node_modules'], {cwd});
        if (fu) return new PackageDir(path.dirname(fu));
    }

    static promote(dir: string | PackageDir): PackageDir {
        return dir instanceof this ? dir : new this(dir);
    }
}

class SourceFile extends ModuleRef {
    filename: string
    contentType?: string
    inDir?: PackageDir
    constructor(filename: string, inDir?: PackageDir, contentType?: string) {
        super();
        this.filename = filename;
        this.contentType = contentType;
        this.inDir = inDir || PackageDir.lookUp(this.filename);
    }
    get id() { return JSON.stringify([this.constructor.name, this.filename]); };
    get package() {
        let pkg = this.inDir;
        while (pkg && !pkg.manifestFile) pkg = pkg.parent;
        return pkg;
    }
    get canonicalName() {
        let pkg = this.package;
        return pkg ? `${pkg.canonicalName}:${path.relative(pkg.dir, this.filename)}`
             : this.filename;
    }
    get relativePath() {
        let pkg = this.package;
        return pkg ? path.relative(pkg.dir, this.filename) : this.filename;
    }
    readSync() { return fs.readFileSync(this.filename, 'utf-8'); }
}

class TransientCode extends ModuleRef {
    contentType: string
    content: string
    filename?: string /* suggested name */
    constructor(content: string, contentType: string, filename?: string) {
        super();
        this.contentType = contentType;
        this.content = content;
        this.filename = filename;
    }
    get canonicalName(): string { throw new Error('Internal error: TransientCode#canonicalName'); }
}

class BinaryAsset extends ModuleRef {
    contentType: string
    content: Uint8Array
    filename?: string /* suggested name */
    constructor(content: Uint8Array, contentType: string, filename?: string) {
        super();
        this.contentType = contentType;
        this.content = content;
        this.filename = filename;
    }
    get canonicalName(): string { throw new Error('Internal error: BinaryAsset#canonicalName'); }
}

class GroupedModules extends ModuleRef {
    main: ModuleRef
    companions: {[name: string]: ModuleRef}
    constructor(main: ModuleRef, companions: {[name: string]: ModuleRef}) {
        super();
        this.main = main;
        this.companions = companions;
    }
    get id() { return this.main.id; }
    get canonicalName() { return this.main.canonicalName; }
    normalize() { return this.main; }

    /** 
     * References to companion modules within a group
     * are marked with a leading `*`.
     */
    static isCompanion(name: string) { return !!name.match(/^\*/); }
    static companion(name: string) { return new SourceFile(name.replace(/^\*/, '')); }
}

class NodeModule extends ModuleRef {
    name: string
    constructor(name: string) {
        super();
        this.name = name.replace(/^node:/, '');
    }
    get canonicalName() { return `node://${this.name}`; }

    static isExplicit(name: string): boolean {
        return !!name.match(/^node:/);
    }
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
}

class StubModule extends ModuleRef {
    name: string
    context: string
    reason: ModuleResolutionError
    constructor(name: string, context: string, reason: ModuleResolutionError)
    { super(); this.name = name; this.context = context; this.reason = reason; }
    get id() { return JSON.stringify([this.constructor.name, this.name]); };
    get canonicalName() { return `stub://${this.name}`; }
}

type ModuleDependency<T = any> = 
    {source: T, target: ModuleRef, compiled?: ModuleRef[], deployed?: string[]};


class ModuleResolutionError { }
interface ModuleResolutionError { repr?: string }

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



export { ModuleRef, SourceFile, PackageDir, TransientCode, BinaryAsset,
         GroupedModules, NodeModule, ShimModule, StubModule, ModuleDependency,
         ModuleResolutionError, FileNotFound, MainFileNotFound }