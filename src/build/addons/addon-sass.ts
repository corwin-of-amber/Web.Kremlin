import sass from 'sass';

import { ModuleRef, TransientCode } from '../modules';
import { Transpiler } from '../transpile';


class SASSCompiler implements Transpiler {
    match(filename: string) { return !!filename.match(/[.]s[ac]ss$/); }

    compileFile(filename: string) {
        let out = sass.compile(filename, {sourceMap: true, sourceMapIncludeSources: true});
        return new TransientCode(out.css, 'css');
    }

    compileSource(source: string, filename?: string): ModuleRef {
        let out = sass.compileString(source, {url: new URL('file://'+filename), syntax: 'scss'});
        return new TransientCode(out.css, 'css');
    }
}


export { SASSCompiler }