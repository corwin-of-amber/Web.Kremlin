const fs = (0||require)('fs') as typeof import('fs'),
      mkdirp = (0||require)('mkdirp') as typeof import('mkdirp');
import path from 'path';

import type { SFCDescriptor } from '@vue/compiler-sfc';

import { Transpiler } from '../transpile';
import { SourceFile, GroupedModules, TransientCode } from '../modules';



class VueCompiler implements Transpiler {
    sfc: typeof import ('@vue/compiler-sfc')
    outDir: string

    constructor() {
        this.outDir = 'build/kremlin/vue-components';
    }

    load() {
        if (!this.sfc) {
            this.sfc = (0||require)('@vue/compiler-sfc');
        }
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename?: string) {
        this.load();
        var id = 'deadbeef',
            parsed = this.sfc.parse(source, {sourceMap: true, filename});
        
        var out = this.assemble(parsed.descriptor, id, filename);

        var outCss = new SourceFile(this._basename(filename) + '.css'),
            outJs = this._output(parsed.descriptor, 
                `import '*${outCss.filename}';\n${out.js}`, filename);
        mkdirp.sync(path.dirname(outCss.filename));
        fs.writeFileSync(outCss.filename, out.css);
        return new GroupedModules(outJs, {
            [outCss.filename]: outCss
        });
    }

    assemble(descriptor: SFCDescriptor, id: string, filename?: string) {
        var scopeId = `data-v-${id}`;

        var template = this.sfc.compileTemplate({id, filename,
                scoped: true,
                source: descriptor.template.content,
                compilerOptions: {scopeId}
            }),
            styles = descriptor.styles.map(s =>
                this.sfc.compileStyle({id, filename,
                    scoped: s.scoped,
                    source: s.content
                })),
            script = this.sfc.compileScript(descriptor, {id});

        return {
            css: styles.map(s => s.code).join('\n'),
            js:
                `const __scopeId = ${JSON.stringify(scopeId)}\n` +
                `${template.code}\n${this._patchExport(script.content)}`
        };
    }

    _basename(filename?: string) {
        return (filename ? path.basename(filename) : 'tmp.vue');
    }

    _output(parsed: SFCDescriptor, content: string, filename?: string): TransientCode {
        var lang = parsed.script.attrs['lang'] as string,
            type = {'ts': '.ts', 'typescript': '.ts'}[lang] || 'js',
            ext = `.${type}`;
        return new TransientCode(
            content, type, this._basename(filename) + ext);
    }

    /** @oops */
    _patchExport(js: string) {
        return js.replace(/export\s+default\s+\{/,
            x => x + 'render, __scopeId,');
    }
}



export { VueCompiler }