import fs from 'fs';
import path from 'path';

import { ModuleRef, BinaryAsset } from './modules';
import { SearchPath } from './bundle';



interface Transpiler {
    match(filename: string): boolean;
    compileFile(filename: string): ModuleRef;
    compileSource(source: string, filename?: string): ModuleRef;
}


/**
 * Links to resource assets (images, fonts, etc.).
 */
class AssetBundler implements Transpiler {
    extensions = ['png', 'jpg', 'svg', 'ttf', 'woff', 'woff2', 'otf']
    _re?: RegExp = undefined

    match(filename: string): boolean {
        this._re ??= new RegExp(`[.](${this.extensions.join('|')})`);
        return !!filename.match(this._re);
    }

    compileFile(filename: string): ModuleRef {
        return new BinaryAsset(fs.readFileSync(filename), 'application/octet-stream', filename);
    }

    compileSource(source: string, filename?: string): ModuleRef {
        throw new Error('Method not implemented.');
    }
}

/**
 * Uses precompiled artifacts instead of compiling on-the-fly.
 * Currently hard-coded to look for JavaScript transpiled from TypeScript
 * and LiveScript.
 */
class DummyCompiler implements Transpiler {
    searchPath: SearchPath

    constructor(searchPath: SearchPath = new SearchPath([], [])) {
        this.searchPath = searchPath;
    }

    match(filename: string) { return true; }

    compileFile(filename: string) {
        var sp = new SearchPath(this.searchPath.dirs, [path.dirname(filename)]);

        for (let basejs of this.candidates(filename)) {
            try {
                return sp.lookup(basejs);
            }
            catch { }
        }

        throw new Error(`Could not find compiled module '${filename}'`);
    }

    compileSource(source: string, filename?: string): ModuleRef {
        throw new Error(`Could not find compiled module '${filename || 'unknown'}'`);
    }

    candidates(filename: string) {
        var basename = path.basename(filename);

        if (basename.match(/\.ts$/)) {
            return this.suffixes(filename.replace(/\.ts$/, '.js'))
                .concat(['./' + basename.replace(/\.ts$/, '.ts.js')]);
        }
        else if (basename.match(/\.ls$/)) {
            return ['./' + basename.replace(/\.ls$/, '.ls.js')];
        }
        else return [];
    }

    suffixes(filename: string) {
        var dir = path.dirname(filename), l: string[] = [];
        while (dir.length > 1) {
            l.push(path.relative(dir, filename));
            dir = path.dirname(dir);
        }
        return l;
    }
}



export { Transpiler, AssetBundler, DummyCompiler }