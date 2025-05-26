import path from 'path'; /* @kremlin.native */
import * as resolve from 'resolve.exports';
import 'zone.js';

import { lazily } from '../infra/memo';
import nonenumerable from '../infra/non-enumerable';
import { ModuleRef, NodeModule, ShimModule,
         PackageDir, SourceFile, MainFileNotFound, FileNotFound } from './modules';
import { SearchPath } from './search-path';
import type { Transpiler } from './transpile';
import type { Adjustment } from './adjustments';
import { BuildCache, OutputCache } from './cache';
import { Report, ReportSilent } from './ui/report';


class Environment {
    infra: Library[] = []
    compilers: Transpiler[] = []
    adjustments: {[type: string]: Adjustment[]} = {}
    policy: Policy = new PolicyBase
    cache: {build: BuildCache, out: OutputCache} =
        {build: new BuildCache, out: new OutputCache}
    report: Report = new ReportSilent
}

namespace Environment {
    export function get(): Environment {
        return Zone.current.get('env') ?? Environment.NULL();
    }
    export function runIn<T>(env: Environment, cb: () => T): T {
        return Zone.current.fork({name: 'Environment', properties: {env}})
                           .run(cb);
    }

    export const NULL = lazily(() => new Environment());
}

class InEnvironment {
    @nonenumerable
    env: Environment
    in(env: Environment) { this.env = env; return this; }
}

class Library {
    override: boolean = false  /* whether to prioritize over local modules */
    modules: (ModuleRef & {name: string})[] = []
}


class NodeJSRuntime extends Library {
    constructor() {
        super();
        this.modules = ['fs', 'fs/promises', 'path', 'events', 'assert', 'zlib', 'stream', 'util',
                        'crypto', 'net', 'tty', 'os', 'constants', 'vm',
                        'http', 'https', 'url', 'querystring', 'tls', 'timers',
                        'buffer', 'process', 'child_process', 'string_decoder',
                        'dgram', 'dns', 'module', 'worker_threads']
            .map(m => new NodeModule(m));
    }
}

class BrowserShims extends Library {
    constructor() {
        super();
        var path = this.getPath();
        this.modules = ['path', 'events', 'assert', 'util', 'zlib', 'stream',
                        'url', 'querystring', 'crypto', 'buffer', 'process',
                        'vm']
            .map(m => {
                try { return new ShimModule(m, path.lookup(m)); }
                catch (e) { if (!(e instanceof FileNotFound)) throw e; } 
            }).filter(x => x); 
    }

    getPath() {
        const findUp = (0||require)('find-up'),
              cwd = typeof __dirname !== 'undefined' ? __dirname : '.',
              nmdir = findUp.sync('node_modules', {cwd, type: 'directory'});

        return new SearchPath(
            [nmdir, ...BrowserShims.ALTPATHS.map(e => path.join(nmdir, ...e))],
            [], BrowserShims.ALTNAMES);
    }

    static readonly ALTNAMES = {
        zlib: 'browserify-zlib', crypto: 'crypto-browserify',
        stream: 'stream-browserify', vm: 'vm-browserify'
    }

    static readonly ALTPATHS = [
        ['nwjs-kremlin-shim', 'node_modules'],
        ['..', 'shim', 'node_modules']
    ]
}

/**
 * A Policy instructs the bundler how to locate modules in packages.
 */
interface Policy {
    packageEntryPoint(pd: PackageDir): SourceFile;
    packageAliases(pd: PackageDir): {[name: string]: any}[]
    packageOverrides(pd: PackageDir): {[name: string]: any}[]
}

class PolicyBase implements Policy {
    getMainFilenames(packageJson: any) {
        return ['index'];
    }

    packageEntryPoint(pd: PackageDir): SourceFile {
        var aliases = this.packageAliases(pd);
        for (let candidate of this.getMainFilenames(pd.manifest)
                              .filter(x => typeof x === 'string')) {
            for (let ext of ['', '.js', '.ts']) {  /** @oops hard-coded extensions here */
                let fn = candidate + ext;
                fn = this._resolveAliases(aliases, fn) ?? fn;
                let sf = pd.getIfExists(fn)?.normalize();
                if (sf instanceof SourceFile) return sf;
            }
        }
        throw new MainFileNotFound(pd);
    }

    getAliasFields(packageJson: any) {
        return [];
    }

    packageAliases(pd: PackageDir): {[name: string]: any}[] {
        return this.getAliasFields(pd.manifest)
            .filter(x => typeof x === 'object');
    }

    getOverrideFields(packageJson: any) {
        return [];
    }

    packageOverrides(pd: PackageDir): {[name: string]: any}[] {
        return this.getOverrideFields(pd.manifest)
            .filter(x => typeof x === 'object');
    }

    // a bit ad-hoc, should probably be in `SearchPath`
    _resolveAliases(aliases: {[name: string]: string}[], fn: string) {
        let prefix = fn.startsWith('./') ? '' : './',
            key = prefix + fn;
        for (let al of aliases)
            if (Object.hasOwn(al, key)) return al[key];
    }
}

class NodeJSPolicy extends PolicyBase {
    getMainFilenames(packageJson: any) {
        let rv = resolve.exports(packageJson, '.') || [];
        return [...rv, packageJson.module, packageJson.main,
                packageJson.exports?.node?.import /** @todo unneeded? */,
                'index']
    }

    getAliasFields(packageJson: any) {
        return [packageJson.exports];
    }

    getOverrideFields(packageJson: any) {
        return [packageJson.kremlin?.node?.externals];
    }
}

class BrowserPolicy extends PolicyBase {
    getMainFilenames(packageJson: any) {
        let rv = resolve.exports(packageJson, '.', {browser: true}) || [];
        return [...rv, packageJson.browser, packageJson.module,
                packageJson.main, 'index']
    }

    getAliasFields(packageJson: any) {
        return [packageJson.browser, packageJson.exports];
    }

    getOverrideFields(packageJson: any) {
        var m = packageJson;
        return typeof m.browser === 'object' && m.browser['mass-confusion']
            ? [m.browser] : [];
    }
}


export { Environment, InEnvironment, Library,
         NodeJSRuntime, BrowserShims, NodeJSPolicy, BrowserPolicy }