import path from 'path';

import { SearchPath } from './bundle';



class DummyCompiler {
    searchPath: SearchPath

    constructor(searchPath: SearchPath = new SearchPath([], [])) {
        this.searchPath = searchPath;
    }

    compileFile(filename: string) {
        var sp = new SearchPath(this.searchPath.dirs, [path.dirname(filename)]),
            basename = path.basename(filename);

        for (let basejs of this.candidates(basename)) {
            try {
                return sp.lookup(basejs);
            }
            catch { }
        }

        throw new Error(`Could not find compiled module '${filename}'`);
    }

    candidates(basename: string) { 
        return [basename.replace(/\.ts$/, '.js'),
                './' + basename.replace(/\.ls$/, '.ls.js')];
    }
}



export { DummyCompiler }