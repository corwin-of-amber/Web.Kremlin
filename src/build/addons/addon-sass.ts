/**
 * @oops this is horrible! But the Dart compiler emits code that requires
 * special treatment for Electron:
 * https://github.com/mbullington/node_preamble.dart/blob/3c83ba0887fb64424d3336338da393e4f0eecbf4/lib/preamble.js#L50
 * and this treatment is not applied to NWjs (probably because no one tried it).
 * 
 * The SASS compiler is written in Dart, so this code ends up in the lib.
 * This messes up the Kremlin plug when running in NWjs.
 */
if (typeof process !== 'undefined' && process.versions['nw'])
    process.versions['electron'] = 'FAKE (hack for sass@1.52.3:sass.dart.js)';


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