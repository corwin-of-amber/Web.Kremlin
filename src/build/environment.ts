const path = (0||require)('path') as typeof import('path');
import 'zone.js';

import nonenumerable from '../infra/non-enumerable';
import { ModuleRef, NodeModule, ShimModule,
         PackageDir, SourceFile, MainFileNotFound } from './modules';
import type { Transpiler } from './transpile';


class Environment {
    infra: Library[] = []
    compilers: Transpiler[] = []
    policy: Policy = new BrowserPolicy
    cache: BuildCache = new BuildCache
    report: Report = new ReportSilent
}

namespace Environment {
    export function get(): Environment {
        return Zone.current.get('env');
    }
    export function runIn<T>(env: Environment, cb: () => T): T {
        return Zone.current.fork({name: 'Environment', properties: {env}})
                           .run(cb);
    }
}

class InEnvironment {
    @nonenumerable
    env: Environment
    in(env: Environment) { this.env = env; return this; }
}

class Library {
    modules: (ModuleRef & {name: string})[] = [];
}

export { Environment, InEnvironment, Library }

/* needs to be after InEnvironment, Library (cyclic deps :/) */
import { BuildCache } from './cache';
import { Report, ReportSilent } from './ui/report';
import { SearchPath } from './bundle';


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
        var path = this.getPath();
        this.modules = ['path', 'events', 'assert', 'util', 'zlib', 'stream',
                        'url', 'querystring', 'crypto', 'buffer', 'process']
            .map(m => new ShimModule(m, path.lookup(m))); 
    }

    getPath() {
        const findUp = (0||require)('find-up'),
              cwd = typeof __dirname !== 'undefined' ? __dirname : '.',
              nmdir = findUp.sync('node_modules', {cwd, type: 'directory'});

        return new SearchPath(
            [nmdir, path.join(nmdir, '..', 'shim', 'node_modules')], [], 
            BrowserShims.ALTNAMES);
    }

    static readonly ALTNAMES = {
        zlib: 'browserify-zlib', crypto: 'crypto-browserify',
        stream: 'stream-browserify'
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
                var sf = pd.getIfExists(candidate + ext)?.normalize();
                if (sf instanceof SourceFile) return sf;
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



export { NodeJSRuntime, BrowserShims, NodeJSPolicy, BrowserPolicy }