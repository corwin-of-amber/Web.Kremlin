const fs = (0||require)('fs'),
      mkdirp = (0||require)('mkdirp');
import path from 'path';

import VueComponentCompiler, { SFCCompiler } from '@vue/component-compiler'
const vueComponentCompiler = (0||require)('@vue/component-compiler') as typeof VueComponentCompiler;

import { Transpiler } from '../transpile';
import { SourceFile } from '../bundle';



class VueCompiler implements Transpiler {
    cc: SFCCompiler
    outDir: string

    constructor() {
        this.cc = vueComponentCompiler.createDefaultCompiler();
        this.outDir = 'build/kremlin/vue-components';
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }

    compileFile(filename: string) {
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



export { VueCompiler }