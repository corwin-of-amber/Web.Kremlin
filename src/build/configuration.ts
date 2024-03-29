import fs from 'fs'       /** @kremlin.native */
import path from 'path';  /** @kremlin.native */
import type { ProjectDefinition } from '../project';
import { Environment, Library } from './environment';
import { SourceFile, PackageDir, ShimModule, StubModule, NodeModule,
         ModuleResolutionError } from './modules';


class UserDefinedProjectOptions {
    proj: {ignore?: string[]} = {}

    constructor(pd: PackageDir) {
        if (pd.manifestFile) {
            var ignoreDefs = pd.manifest?.kremlin?.ignore;
            if (ignoreDefs) this.setIgnores(ignoreDefs);
        }
    }

    apply(proj: ProjectDefinition) {
        if (this.proj.ignore)
            proj.ignore = [...proj.ignore, ...this.proj.ignore];
    }

    setIgnores(defs: any) {
        if (!Array.isArray(defs))
            throw new Error('invalid ignore definitions (`kremlin.ignore`); expected an array');
        for (let d of defs)
            if (typeof d !== 'string')
                throw new Error(`invalid ignore definition '${d}' (in \`kremlin.ignore\`); expected string`);

        this.proj.ignore = defs.map(x => x.toString());
    }
}

class UserDefinedOverrides extends Library {
    override = true  /* always takes precedence */

    constructor(pd: PackageDir) {
        super();
        for (let defs of Environment.get().policy.packageOverrides(pd)) {
            this.globalSubstitutes(pd, defs);
        }
    }

    globalSubstitutes(pd: PackageDir, d: {[name: string]: string | boolean | {}}) {
        for (let [name, sub] of Object.entries(d)) {
            if (!name.startsWith('.')) {
                this.modules.push(typeof sub === 'string'
                    ? new ShimModule(name, this.locateSubstitute(pd, sub))
                    : (sub === true) ? new NodeModule(name)
                                     : new StubModule(name, 'js', new ModuleElided(this, pd)));
            }
        }
    }

    locateSubstitute(pd: PackageDir, sub: string) {
        /** @todo this should probably be deferred to the crawling phase */
        var fp = path.join(pd.dir, sub);
        try {
            if (!fs.statSync(fp).isDirectory()) return new SourceFile(fp);
        }
        catch { }
        return new PackageDir(fp);
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


/** 
 * Not an error per se, but a placeholder used for the `reason` in `StubModule`s.
 */
class ModuleElided extends ModuleResolutionError { 
    constructor(public by: UserDefinedOverrides, public at: PackageDir) { super(); }
    get repr() { return '{ excluded by user }'; }
}


export { UserDefinedProjectOptions, UserDefinedOverrides, UserDefinedAssets,
         ModuleElided }