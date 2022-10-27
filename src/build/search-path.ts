import fs from 'fs';       /* @kremlin.native */
import path from 'path';   /* @kremlin.native */
import assert from 'assert';
import { Environment } from './environment';
import { PackageDir, SourceFile, FileNotFound } from './modules';


class SearchPath {
    dirs: string[]
    wdirs: string[]
    extensions: string[]
    aliases: {[mod: string]: string}

    constructor(dirs: string[], wdirs: string[], aliases = {}) {
        this.dirs = dirs;
        this.wdirs = wdirs;
        this.extensions = ['.js', '.ts'];
        this.aliases = aliases;
    }

    lookup(pth: string) {
        // @todo can the treatment of aliases be done completely within `existsModule`?
        pth = this.aliases[pth] || pth;
        var inDirs = pth.startsWith('.') ? this.wdirs : this.dirs;
        for (let d of inDirs) {
            var mp = this.existsModule(d, pth);
            if (mp) return mp;
        }
        throw new FileNotFound(pth, inDirs);
    }

    existsModule(basedir: string, pth: string): PackageDir | SourceFile {
        var basename = path.basename(pth),
            pels = path.dirname(pth).split('/').filter(x => x != '.');

        let cwd = this._withAliases(new SearchPath.DirCursor(basedir, {}));
        for (let pel of pels)
            cwd = this._withAliases(cwd.get(pel));

        for (var ext of ['', ...this.extensions]) {
            try {
                var entry = cwd.get(basename + ext);
                    //stat = fs.statSync(epath);
                if (entry.isFile()) return new SourceFile(entry.path);
            }
            catch { }
        }
        if ((cwd = cwd.get(basename)).isDirectory())
            return new PackageDir(cwd.path);
    }

    _withAliases(cur: SearchPath.DirCursor) {
        let aliases = SearchPath._aliased(cur.path);
        cur.aliases = SearchPath.aliasesToTree(aliases, cur.aliases, cur.path);
        return cur;
    }

    static _aliased(cwd: string) {
        var pd = new PackageDir(cwd);
        return Object.assign({},
            ...Environment.get().policy.packageAliases(pd));
    }

    static from(dir: string) {
        var l = [dir], d = dir;
        while (d != '.' && d != '/') {
            d = path.dirname(d);
            l.push(d);
        }
        return new SearchPath(l.map(d => path.join(d, 'node_modules')), [dir],
                              this._aliased(dir));
    }
}

namespace SearchPath {
    export class DirCursor {
        phys: string /** physical path */
        aliases: AliasTree

        constructor(phys: string, aliases: AliasTree) {
            this.phys = phys;
            this.aliases = aliases;
        }

        get(name: string) {
            if (name === '.') return this;
            else return new DirCursor(path.join(this.path, name),
                Object.hasOwn(this.aliases, name) ? aobj(this.aliases[name]) : {});
        }

        get path() {
            return Object.hasOwn(this.aliases, '.')
                   ? (this.aliases['.'] as string) : this.phys;
        }

        exists() { return this._stat(_ => true); }
        isFile() { return this._stat(_ => _.isFile()); }
        isDirectory() { return this._stat(_ => _.isDirectory()); }

        _stat(op: (s: fs.Stats) => boolean) {
            try { return op(fs.statSync(this.path)); }
            catch { return false; }
        }
    }

    type AliasTree = {[name: string]: string | AliasTree} /* note: only '.' is allowed to have a string value */

    export function aliasesToTree(desc: {[name: string]: string}, into: AliasTree = {}, baseDir?: string) {
        let al: AliasTree = into;
        for (let [name, target] of Object.entries(desc)) {
            if (typeof target !== 'string') continue;  // better filter out beforehand?..
            let steps = name.split('/').filter(x => x && x !== '.'),
                cur: AliasTree = al;
            for (let pel of steps) {
                cur = aobj(cur[pel] ??= {});
            }
            cur['.'] = baseDir ? path.join(baseDir, target) : target;
        }
        return al;
    }

    function aobj<T>(a: T): T & object {
        assert(typeof a === 'object');
        return a;
    }
}


export { SearchPath }