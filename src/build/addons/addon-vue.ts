const fs = (0||require)('fs') as typeof import('fs'),
      mkdirp = (0||require)('mkdirp') as typeof import('mkdirp');
import path from 'path';

import {
    parse,
    compileTemplate,
    compileStyle,
    SFCBlock,
    SFCDescriptor,
    SFCTemplateCompileOptions,
    compileScript,
  } from '@vue/compiler-sfc'
  /*
import type VueComponentCompiler from '@vue/component-compiler'
import type { SFCCompiler } from '@vue/component-compiler'
import VueTemplateCompiler from 'vue-template-compiler'
*/
import { Transpiler } from '../transpile';
import { SourceFile } from '../modules';



class VueCompiler implements Transpiler {
    /*cc: typeof VueComponentCompiler
    tc: typeof VueTemplateCompiler
    sfc: SFCCompiler*/
    outDir: string

    constructor() {
        this.outDir = 'build/kremlin/vue-components';
    }

    load() {
        /*
        if (!this.cc) {
            this.cc = (0||require)('@vue/component-compiler');
            this.tc = (0||require)('vue-template-compiler');
            this.sfc = this.cc.createDefaultCompiler();
        }
        */
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename?: string) {
        //this.load();
        var parsed = parse(source, {sourceMap: true, filename});
        
        console.log(parsed);
        console.log(compileTemplate({id: '1', 
            source: parsed.descriptor.template.content, filename}));
        //console.log(compileStyle({id: '1', source: parsed.descriptor.styles[0].content, filename}));
        console.log(compileScript(parsed.descriptor, {id: '1'}));
        return new SourceFile(filename);
        /*
        this.tc.parseComponent(source),
            desc = this.sfc.compileToDescriptor(filename, source);
        var out = this.cc.assemble(this.sfc, filename, desc, {}),
            outFn = path.join(this.outDir, 
                              this._outputBasename(parsed, filename));

        mkdirp.sync(path.dirname(outFn));
        fs.writeFileSync(outFn, out.code);
        return new SourceFile(outFn);*/
    }

    _outputBasename(parsed: SFCDescriptor, filename?: string) {
        var lang = parsed.script.attrs['lang'] as string,
            ext = {'ts': '.ts', 'typescript': '.ts'}[lang];
        return (filename ? path.basename(filename) : 'tmp.vue') + 
               (ext || '.js');
    }
}


new VueCompiler().compileFile('data/div.vue');


export { VueCompiler }