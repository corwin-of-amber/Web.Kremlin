const fs = (0||require)('fs');

const LiveScript = (0||require)('livescript')

import { TransientCode } from '../modules';
import { Transpiler } from '../transpile';



class LiveScriptCompiler implements Transpiler {
    opts: {map: 'embedded'}

    match(filename: string) { return !!filename.match(/[.]ls$/); }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename)
    }

    compileSource(source: string, filename: string) {
        var out = LiveScript.compile(source, {filename, ...this.opts});
        return new TransientCode(typeof out == 'string' ? out : out.code, 'js');
    }
}



export { LiveScriptCompiler }
