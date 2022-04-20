const fs = (0||require)('fs') as typeof import('fs'),
      mkdirp = (0||require)('mkdirp') as typeof import('mkdirp'),
      findUp = (0||require)('find-up') as typeof import('find-up');
import path from 'path';
import { nanoid } from 'nanoid';

import type { VueComponentCompiler, VueTemplateCompiler } from '../../../addons/vue/v2';
import type { SFCDescriptor } from '../../../addons/vue/v3';

import { Transpiler } from '../transpile';
import { ModuleRef, SourceFile, GroupedModules, TransientCode } from '../modules';



abstract class VueCompiler implements Transpiler {
    outDir: string

    constructor() {
        this.outDir = 'build/kremlin/vue-components';
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }
    
    abstract compileFile(filename: string): ModuleRef
    abstract compileSource(source: string, filename?: string): ModuleRef
}


class VueCompilerAutodetect extends VueCompiler {
    _loaded: Map<number, VueCompiler> = new Map

    compileFile(filename: string) {
        var c = this.autoload(filename);
        return c.compileFile(filename);
    }

    compileSource(source: string, filename?: string) {
        var c = this.autoload(filename);
        return c.compileSource(source, filename);
    }

    autoload(filename?: string) {
        return this._load(this.autodetect(filename));
    }

    _load(version: number) {
        var c = this._loaded.get(version);
        if (c) return c;
        else switch (version) {
            case 2: c = new Vue2Compiler; break;
            case 3: c = new Vue3Compiler; break;
        }
        this._loaded.set(version, c);
        return c;
    }

    /**
     * Inspects `package-lock.json` to find the version of Vue used by the
     * project.
     * @param filename name of file being compiled
     * @returns either `2` or `3`
     */
    autodetect(filename?: string) {
        var dir = filename ? path.dirname(filename) : '.',
            pkglock = findUp.sync('package-lock.json', {cwd: dir});
        if (pkglock) {
            var json = JSON.parse(fs.readFileSync(pkglock, 'utf-8')),
                vue = json.dependencies?.['vue']?.version;
            if (typeof vue === 'string' && vue.startsWith('3'))
                return 3;
        }
        return 2;
    }
}


class Vue2Compiler extends VueCompiler {
    cc: typeof VueComponentCompiler
    tc: typeof VueTemplateCompiler
    sfc: VueComponentCompiler.SFCCompiler

    load() {
        if (!this.cc) {
            var deps = (0||require)('../../addons/vue/v2') as typeof import('../../../addons/vue/v2');  /** @ouch */
            this.cc = deps.VueComponentCompiler;
            this.tc = deps.VueTemplateCompiler;
            this.sfc = this.cc.createDefaultCompiler();
        }
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename?: string) {
        this.load();
        var parsed = this.tc.parseComponent(source),
            desc = this.sfc.compileToDescriptor(filename, source);
        var out = this.cc.assemble(this.sfc, filename, desc, {}),
            outFn = path.join(this.outDir, 
                              this._outputBasename(parsed, filename));

        mkdirp.sync(path.dirname(outFn));
        fs.writeFileSync(outFn, out.code);
        return new SourceFile(outFn);
    }

    _outputBasename(parsed: VueTemplateCompiler.SFCDescriptor, filename?: string) {
        var lang = parsed.script.attrs['lang'] as string,
            ext = {'ts': '.ts', 'typescript': '.ts'}[lang];
        return (filename ? path.basename(filename) : 'tmp.vue') + 
               (ext || '.js');
    }
}


class Vue3Compiler extends VueCompiler {
    sfc: typeof import ('../../../addons/vue/v3')

    load() {
        if (!this.sfc) {
            this.sfc = (0||require)('../../addons/vue/v3'); /** @ouch */
        }
    }

    match(filename: string) { return !!filename.match(/[.]vue$/); }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename?: string) {
        this.load();
        var id = nanoid(8),
            parsed = this.sfc.parse(source, {sourceMap: true, filename});
        
        var out = this.assemble(parsed.descriptor, id, filename);

        var outCss = new SourceFile(
                path.join(this.outDir, this._basename(filename) + '.css')),
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



export { VueCompilerAutodetect as VueCompiler }