const fs = (0||require)('fs') as typeof import('fs'),
      path = (0||require)('path') as typeof import('path'),
      findUp = (0||require)('find-up');

import type TypeScript from 'typescript';

import { TransientCode } from '../modules';
import { Transpiler } from '../transpile';



class TypeScriptCompiler implements Transpiler {
    opts = {inlineSources: true, inlineSourceMap: true}
    cc: typeof TypeScript

    match(filename: string) { return !!filename.match(/[.]ts$/); }

    load() {
        if (!this.cc)
            this.cc = (0||require)('typescript');
    }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename: string) {
        this.load();
        var out = this.cc.transpileModule(source, this.getConfigFor(filename));
        return new TransientCode(out.outputText, 'js');
    }

    getConfigFor(filename: string) {
        var cwd = path.dirname(filename),
            found = findUp.sync('tsconfig.json', {cwd});
        return this._opts(found && JSON.parse(fs.readFileSync(found, 'utf-8')), filename);
    }

    _opts(config: TypeScript.TranspileOptions = {}, filename?: string) {
        var co = config.compilerOptions;
        config.compilerOptions = {...this.opts, ...co};
        config.fileName = filename;
        return config;
    }
}



export { TypeScriptCompiler }
