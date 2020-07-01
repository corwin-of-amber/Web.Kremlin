const fs = (0||require)('fs'), mkdirp = (0||require)('mkdirp');
import path from 'path';

import { SearchPath, ModuleRef, SourceFile } from './bundle';



interface Transpiler {
    match(filename: string): boolean;
    compileFile(filename: string): ModuleRef;
}


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


import VueComponentCompiler, { SFCCompiler } from '@vue/component-compiler'

const vueComponentCompiler = (0||require)('@vue/component-compiler') as typeof VueComponentCompiler;


class VueCompiler implements Transpiler {
    cc: SFCCompiler
    outDir: string

    constructor() {
        this.cc = vueComponentCompiler.createDefaultCompiler();
        this.outDir = 'build/kremlin/vue-components';
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }

    compileFile(filename: string) {
        const fs = (0||require)('fs');
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename?: string) {
        var desc = this.cc.compileToDescriptor(filename, source);
        var out = vueComponentCompiler.assemble(this.cc, filename, desc, {}),
            outFn = path.join(this.outDir, 
                        (filename ? path.basename(filename) : 'tmp.vue') + '.js');

        mkdirp.sync(path.dirname(outFn));
        fs.writeFileSync(outFn, out.code);
        return new SourceFile(outFn);
    }
}



export { Transpiler, DummyCompiler, VueCompiler }