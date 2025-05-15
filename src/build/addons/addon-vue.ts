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

    get banner() {
        return `/* created by ${this.constructor.name} */`;
    }
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
     * Falls back to `3` if version info cannot be found.
     * @param filename name of file being compiled
     * @returns either `2` or `3`
     */
    autodetect(filename?: string): 2 | 3 {
        var dir = filename ? path.dirname(filename) : '.',
            pkglock = findUp.sync('package-lock.json', {cwd: dir});
        if (pkglock) {
            var json = JSON.parse(fs.readFileSync(pkglock, 'utf-8')),
                vue = json.dependencies?.['vue']?.version /* legacy lockfile v1 */
                   ?? json.packages?.['node_modules/vue']?.version;
            if (typeof vue === 'string' && vue.startsWith('2'))
                return 2;
        }
        return 3;
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
        fs.writeFileSync(outFn, this.banner + out.code);
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

    readonly EXPORT_IDENT = '__sfc'

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
                path.join(this.outDir, `${this._basename(filename)}-${id}.css`)),
            outJs = this._output(parsed.descriptor, this.banner +
                `import '*${outCss.filename}';\n${out.js}`, filename);
        fs.mkdirSync(path.dirname(outCss.filename), {recursive: true});
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
                `${template.code}\n${this._injectExport(script.content)}`
        };
    }

    override get banner() {
        return super.banner + ' window.__VUE_OPTIONS_API__ = window.__VUE_PROD_DEVTOOLS__ = true;'
    }

    _basename(filename?: string) {
        return (filename ? path.basename(filename) : 'tmp.vue');
    }

    _output(parsed: SFCDescriptor, content: string, filename?: string): TransientCode {
        var script = parsed.script ?? parsed.scriptSetup,  /* could there be both..? */
            lang = script.attrs['lang'] as string,
            type = {'ts': '.ts', 'typescript': '.ts'}[lang] || 'js',
            ext = `.${type}`;
        return new TransientCode(
            content, type, this._basename(filename) + ext);
    }

    /**
     * This looks hairy but is in fact a standard step in Vue SFC compilation.
     * It stitches together the template and the script.
     * (This code assumes that the template gets compiled into a function
     *  called `render`. This may be default with Vue's setup API)
     * @see https://github.com/vuejs/repl/blob/516b3e154bb8c5f059d396364353ce5ad97a04a6/src/transform.ts#L248
     */
    _injectExport(js: string) {
        let v = this.EXPORT_IDENT;
        return `${this.sfc.rewriteDefault(js, v, ['decorators-legacy'])}\n` +
            `Object.assign(${v}, {render, __scopeId});\n` +
            `export default ${v};`
    }
}



export { VueCompilerAutodetect as VueCompiler }