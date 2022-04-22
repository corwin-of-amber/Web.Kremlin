import fs from 'fs';           /* @kremlin.native */
import crypto from 'crypto';   /* @kremlin.native (for performance) */

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


class OutputCache {
    hashes = new Map<string, string>()

    update(fn: string, content: string | Uint8Array) {
        var h = this.hash(content);
        if (this.hashes.get(fn) !== h) {
            this.hashes.set(fn, h);
            return true;
        }
        else return false;
    }

    hash(content: string | Uint8Array) {
        return crypto.createHash('sha256').update(content).digest('base64');
    }
}



export { BuildCache, OutputCache }