const path = (0||require)('path') as typeof import('path');

import nonenumerable from '../infra/non-enumerable';
import type { Transpiler } from './transpile';


class Environment {
    infra: Library[] = []
    compilers: Transpiler[] = []
    policy: Policy = new BrowserPolicy
    cache: BuildCache = new BuildCache
    report: Report = new ReportSilent
}

class InEnvironment {
    @nonenumerable
    env: Environment
    in(env: Environment) { this.env = env; return this; }
}

export { Environment, InEnvironment }

/* needs to be after InEnvironment (cyclic deps :/) */
import { ModuleRef, NodeModule, ShimModule,
    PackageDir, SourceFile, MainFileNotFound } from './modules';
import { BuildCache } from './cache';
import { Report, ReportSilent } from './ui/report';
    

class Library extends InEnvironment {
    modules: (ModuleRef & {name: string})[] = [];

    in(env: Environment) {
        this.modules = this.modules.map(m => m.in(env));
        return super.in(env);
    }
}

class NodeJSRuntime extends Library {
    constructor() {
        super();
        this.modules = ['fs', 'path', 'events', 'assert', 'zlib', 'stream', 'util',
                        'crypto', 'net', 'tty', 'os', 'constants', 'vm',
                        'http', 'https', 'url', 'querystring', 'tls',
                        'buffer', 'process', 'child_process']
            .map(m => new NodeModule(m));
    }
}

class BrowserShims extends Library {
    constructor() {
        super();
        const findUp = (0||require)('find-up'),
              cwd = typeof __dirname !== 'undefined' ? __dirname : '.',
              shimdir = findUp.sync('shim', {cwd, type: 'directory'}),
              altnames = {zlib: 'browserify-zlib', crypto: 'crypto-browserify',
                          stream: 'stream-browserify'};
        this.modules.push(...['path', 'events', 'assert', 'util', 'zlib', 'stream',
                              'url', 'querystring', 'crypto', 'buffer', 'process']
            .map(m => new ShimModule(m, 
                new PackageDir(path.join(shimdir, 'node_modules', altnames[m] || m)))));
    }
}


interface Policy {
    packageEntryPoint(pd: PackageDir): SourceFile;
}

class PolicyBase implements Policy {
    getMainFilenames(packageJson: any) {
        return ['index'];
    }

    packageEntryPoint(pd: PackageDir): SourceFile {
        for (let candidate of this.getMainFilenames(pd.manifest)
                              .filter(x => typeof x === 'string')) {
            for (let ext of ['', '.js', '.ts']) {  // oops: hard-coded extensions here
                var sf = pd.getIfExists(candidate + ext);
                if (sf) return sf;
            }
        }
        throw new MainFileNotFound(pd);
    }
}

class NodeJSPolicy extends PolicyBase {
    getMainFilenames(packageJson: any) {
        return [packageJson.main, 'index']
    }
}

class BrowserPolicy extends PolicyBase {
    getMainFilenames(packageJson: any) {
        return [packageJson.browser, packageJson.main, 'index']
    }
}



export { Library, NodeJSRuntime, BrowserShims,
         NodeJSPolicy, BrowserPolicy }