const fs = (0||require)('fs'),
      path = (0||require)('path');

declare class LiveScript { 
    compile(source: string, opts: {}) : string | {code: string}
}

import { TransientCode } from '../modules';
import { Transpiler } from '../transpile';



class LiveScriptCompiler implements Transpiler {
    opts = {map: 'embedded'}
    cc: LiveScript

    match(filename: string) { return !!filename.match(/[.]ls$/); }

    load() {
        if (!this.cc)
            this.cc = (0||require)('livescript');
    }

    compileFile(filename: string) {
        return this.compileSource(fs.readFileSync(filename, 'utf-8'), filename);
    }

    compileSource(source: string, filename: string) {
        this.load();
        filename = path.basename(filename); // needed for source maps
        var out = this.cc.compile(source, {filename, ...this.opts});
        return new TransientCode(typeof out == 'string' ? out : out.code, 'js');
    }
}



export { LiveScriptCompiler }
