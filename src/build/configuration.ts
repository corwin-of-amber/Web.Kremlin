import path from 'path';  /** @kremlin.native */
import { Library } from './environment';
import { SourceFile, PackageDir, ShimModule, StubModule } from './modules';


class UserDefinedOverrides extends Library {
    constructor(pd: PackageDir) {
        super();
        if (pd.manifestFile) {
            var m = pd.manifest;
            if (typeof m.browser === 'object' && m.browser['mass-confusion']) {
                this.globalSubstitutes(pd, m.browser);
            }
        }
    }

    globalSubstitutes(pd: PackageDir, d: {[name: string]: string | boolean | {}}) {
        for (let [name, sub] of Object.entries(d)) {
            if (!name.startsWith('.')) {
                this.modules.push(typeof sub === 'string'
                    ? new ShimModule(name, new PackageDir(path.join(pd.dir, sub)))
                    : new StubModule(name, null));
            }
        }
    }
}

class UserDefinedAssets {
    assets: SourceFile[] = []

    constructor(pd: PackageDir) {
        if (pd.manifestFile) {
            var assetDefs = pd.manifest?.kremlin?.assets;
            if (assetDefs)
                this.declare(pd, assetDefs);
        }
    }

    declare(pd: PackageDir, defs: string[]) {
        if (!Array.isArray(defs))
            throw new Error('invalid asset definitions (`kremlin.assets`); expected an array');

        for (let fn of defs) {
            if (typeof fn === 'string') {
                var m = pd.getIfExists(fn);
                if (m instanceof SourceFile)
                    this.assets.push(m);
                else
                    throw new Error(`invalid asset '${fn}'; expected a regular file`);
            }
            else
                throw new Error(`invalid asset '${fn}'; expected string`);
        }
    }
}


export { UserDefinedOverrides, UserDefinedAssets }