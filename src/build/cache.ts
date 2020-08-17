const fs = (0||require)('fs') as typeof import('fs');

import { ModuleRef, SourceFile } from './modules';
import { VisitResult } from './bundle';



class BuildCache {

    modules: Map<string, BuildCache.Entry>

    constructor() {
        this.modules = new Map;
    }

    get(m: ModuleRef): BuildCache.Entry {
        var stamp = this.stamp(m);
        if (!stamp) return {stamp: null};  // not cached

        var key = m.id,
            value = this.modules.get(key);

        if (!value || value.stamp !== stamp)
            this.modules.set(key, value = {stamp});
        return value;
    }

    stamp(m: ModuleRef): BuildCache.Stamp {
        if (m instanceof SourceFile) {
            try {
                var stat = fs.statSync(m.filename);
                return +stat.mtime;
            }
            catch { }
        }
    }

    memo<K extends keyof Entry>(m: ModuleRef, field: K,
                                op: (m: ModuleRef) => Entry[K]): Entry[K] {
        var e = this.get(m), v = e[field];
        return v || (e[field] = op(m));
    }
}

type Entry = BuildCache.Entry;


namespace BuildCache {

    export type Entry = {
        stamp: Stamp
        visit?: VisitResult
    };

    export type Stamp = number;

}



export { BuildCache }