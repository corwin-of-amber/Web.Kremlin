import fs from 'fs';       /* @kremlin.native */
import path from 'path';   /* @kremlin.native */
import assert from 'assert';
import { Environment } from './environment';
import { PackageDir, SourceFile, FileNotFound } from './modules';


class SearchPath {
    dirs: string[]
    wdirs: SearchPath.DirCursor[]
    extensions: string[]
    aliases: {[mod: string]: string}

    constructor(dirs: string[], wdirs: SearchPath.DirCursor[], aliases = {}) {
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
        throw new FileNotFound(pth, inDirs.map(x => SearchPath.DirCursor.demote(x)));
    }

    existsModule(basedir: string | SearchPath.DirCursor, pth: string): PackageDir | SourceFile {
        var basename = path.basename(pth),
            pels = SearchPath.splitPath(path.dirname(pth));

        let cwd = SearchPath._withAliases(SearchPath.DirCursor.promote(basedir));
        for (let pel of pels)
            cwd = SearchPath._withAliases(cwd.get(pel));

        for (var ext of ['', ...this.extensions]) {
            try {
                var entry = cwd.get(basename + ext);
                if (entry.isFile()) return new SourceFile(entry.path);
            }
            catch { }
        }
        if ((cwd = cwd.get(basename)).isDirectory())
            return new PackageDir(cwd.path);
    }

    static cursor(dir: string | PackageDir) {
        let aliases = SearchPath._aliased(dir);
        if (dir instanceof PackageDir) dir = dir.dir;
        return new SearchPath.DirCursor(dir,
            SearchPath.aliasesToTree(aliases, {}, dir));
    }

    static cursorAt(sf: SourceFile) {
        return SearchPath.cursor(aexists(sf.package))
            .follow(path.dirname(sf.relativePath));
    }

    static _withAliases(cur: SearchPath.DirCursor) {
        let aliases = SearchPath._aliased(cur.path);
        cur.aliases = SearchPath.aliasesToTree(aliases, cur.aliases, cur.path);
        return cur;
    }

    static _aliased(dir: string | PackageDir) {
        var pd = PackageDir.promote(dir);
        return Object.assign({},
            ...Environment.get().policy.packageAliases(pd));
    }

    /**
     * Creates a SearchPath starting at a given dir and using ancesor
     * `node_modules` according to Node module resolution semantics.
     */
    static from(dir: string | SearchPath.DirCursor) {
        dir = SearchPath.DirCursor.promote(dir);
        let l = [...this._ancestry(dir.path)];
        return new SearchPath(l.map(d => path.join(d, 'node_modules')), [dir],
                              this._aliased(dir.path));
    }

    /**
     * Creates a SearchPath that uses only the specified dir for
     * all searches.
     */
    static fromExact(dir: string | SearchPath.DirCursor) {
        return new SearchPath([SearchPath.DirCursor.demote(dir)],
                              [SearchPath.DirCursor.promote(dir)]);
    }

    static *_ancestry(dir: string) {
        var d = dir;
        yield d;
        while (d != '.' && d != '/') {
            d = path.dirname(d);
            yield d;
        }
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

        get path() {
            return Object.hasOwn(this.aliases, '.')
                   ? (this.aliases['.'] as string) : this.phys;
        }

        get(name: string) {
            if (name === '.') return this;
            else return new DirCursor(path.join(this.path, name),
                Object.hasOwn(this.aliases, name) ? aobj(this.aliases[name]) : {});
        }

        follow(relPath: string) {
            let cur = this as DirCursor;
            for (let pel of splitPath(relPath))
                cur = cur.get(pel);
            return cur;
        }

        exists() { return this._stat(_ => true); }
        isFile() { return this._stat(_ => _.isFile()); }
        isDirectory() { return this._stat(_ => _.isDirectory()); }

        _stat(op: (s: fs.Stats) => boolean) {
            try { return op(fs.statSync(this.path)); }
            catch { return false; }
        }

        static promote(dir: string | DirCursor) {
            return dir instanceof this ? dir : new this(dir, {});
        }

        static demote(dir: string | DirCursor) {
            return dir instanceof this ? dir.path : dir;
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

    export function splitPath(path: string) {
        return path.split('/').filter(x => x && x != '.')
    }

}


function aexists<T>(a: T): T {
    assert(a !== undefined); return a;
}

function aobj<T>(a: T): T & object {
    assert(typeof a === 'object'); return a;
}


export { SearchPath }