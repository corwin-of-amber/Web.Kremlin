const fs = (0||require)('fs') as typeof import('fs'),
      mkdirp = (0||require)('mkdirp') as typeof import('mkdirp');
import path from 'path';

import type VueComponentCompiler from '@vue/component-compiler'
import type { SFCCompiler } from '@vue/component-compiler'

import { Transpiler } from '../transpile';
import { SourceFile } from '../modules';



class VueCompiler implements Transpiler {
    cc: typeof VueComponentCompiler
    sfc: SFCCompiler
    outDir: string

    constructor() {
        this.outDir = 'build/kremlin/vue-components';
    }

    load() {
        if (!this.cc) {
            this.cc = (0||require)('@vue/component-compiler') 
            this.sfc = this.cc.createDefaultCompiler();
        }
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename?: string) {
        this.load();
        var desc = this.sfc.compileToDescriptor(filename, source);
        var out = this.cc.assemble(this.sfc, filename, desc, {}),
            outFn = path.join(this.outDir, 
                        (filename ? path.basename(filename) : 'tmp.vue') + '.js');

        mkdirp.sync(path.dirname(outFn));
        fs.writeFileSync(outFn, out.code);
        return new SourceFile(outFn);
    }
}



export { VueCompiler }