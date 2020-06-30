import path from 'path';

import { SearchPath } from './bundle';



class DummyCompiler {
    searchPath: SearchPath

    constructor(searchPath: SearchPath = new SearchPath([], [])) {
        this.searchPath = searchPath;
    }

    compileFile(filename: string) {
        var sp = new SearchPath(this.searchPath.dirs, [path.dirname(filename)]);

        for (let basejs of this.candidates(filename)) {
            try {
                return sp.lookup(basejs);
            }
            catch { }
        }

        throw new Error(`Could not find compiled module '${filename}'`);
    }

    candidates(filename: string) {
        var basename = path.basename(filename);

        if (basename.match(/\.ts$/)) {
            return this.suffixes(filename.replace(/\.ts$/, '.js'))
                .concat(['./' + basename.replace(/\.ts$/, '.ts.js')]);
        }
        else if (basename.match(/\.ls$/)) {
            return ['./' + basename.replace(/\.ls$/, '.ls.js')];
        }
        else return [];
    }

    suffixes(filename: string) {
        var dir = path.dirname(filename), l: string[] = [];
        while (dir.length > 1) {
            l.push(path.relative(dir, filename));
            dir = path.dirname(dir);
        }
        return l;
    }
}


export { DummyCompiler }