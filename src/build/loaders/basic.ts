import path from 'path';
import { InEnvironment } from '../environment';
import type { CompilationUnit } from '../compilation-unit';
import type { GlobalDependencies } from '../bundle';
import type { AcornJSModule } from './js';
import { ModuleRef, ModuleDependency, SourceFile, TransientCode } from '../modules';



class PassThroughModule extends InEnvironment implements CompilationUnit {
    contentType: string
    content: string | Uint8Array

    constructor(content: string | Uint8Array, contentType: string) {
        super();
        this.contentType = contentType;
        this.content = content;
    }

    process(key: string, deps: ModuleDependency[]) { return this.content; }

    static fromSourceFile(m: SourceFile, contentType?: string) {
        return new this(m.readSync(), contentType ?? this.guessContentType(m));
    }

    static guessContentType(m: SourceFile) {
        if (m.filename.endsWith('.js')) return 'js';
        else if (m.filename.endsWith('.css')) return 'css';
        else return 'plain';
    }
}


class JsonModule extends InEnvironment implements CompilationUnit {
    text: string
    contentType = 'js'

    constructor(text: string) {
        super();
        this.text = text;
    }

    process(key: string, deps: ModuleDependency[]) {
        var prog = this.text;  /** @todo check syntax and/or normalize */
        return `kremlin.m['${key}'] = (module,exports) => (module.exports =\n${prog});`;
    }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync());
    }
}


class ConcatenatedJSModule extends InEnvironment implements CompilationUnit {
    contentType = 'js'
    outDir: string  /* for relative resource paths */

    process(key: string, deps: ModuleDependency<AcornJSModule>[], globals?: GlobalDependencies) {
        var preamble = deps.map(d => d.source?.extractShebang()).find(x => x),
            contents = this.readAll(deps).map(s => s.map(s => this.stripSourceMaps(s))),
            init = this.main(deps.filter(d => d.source), globals);

        return [preamble].concat(...contents).concat(init).join('\n');
    }

    readAll(deps: ModuleDependency<AcornJSModule>[]) {
        return deps.map(d => (d.compiled || []).map(ref =>
            ref instanceof SourceFile && ref.contentType === 'js' ?
                ref.readSync()
            : ref instanceof TransientCode && ref.contentType === 'js' ?
                ref.content
            : ref instanceof SourceFile ?
                this.makeScriptStub(d.target, this._urlOf(ref))
            : undefined
        ).filter(x => x));
    }

    /**
     * *Blasts away* the sourcemaps; in principle, the sourcemaps need
     * to be merged somehow, but for now at least don't let them mislead
     * the debugger because they are falsified in the concatenated result.
     * @param compiled JS output
     */
    stripSourceMaps(compiled: string) {
        return compiled.replace(/^\/\/# sourceMappingURL=.*/gm, '');
    }

    /** @oops `makeScriptStub`, `require`, `_urlOf`, `_rel` duplicate some content from `HtmlModule` */
    makeScriptStub(ref: ModuleRef, content: any = {}) {
        return `kremlin.m['${ref.canonicalName}'] = (mod) => { mod.exports = ${JSON.stringify(content)}; };`;
    }

    main(deps: ModuleDependency<AcornJSModule>[], globals?: GlobalDependencies) {
        var keys = deps.map(d => d.target.normalize().canonicalName);
        /** @todo use `globals` like in HTML */
        return `{ let c = kremlin.main(${JSON.stringify(keys)}); if (typeof module !== 'undefined') module.exports = c; }`;
    }

    _urlOf(m: SourceFile) {
        return this._rel(m.filename);
    }

    _rel(filename: string) {
        return this.outDir ? path.relative(this.outDir, filename) : filename;
    }
}



export { PassThroughModule, JsonModule, ConcatenatedJSModule }