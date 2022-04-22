import { InEnvironment } from '../environment';
import type { AcornJSModule, CompilationUnit } from '../bundle';
import { SourceFile, TransientCode, ModuleDependency } from '../modules';



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

    process(key: string, deps: ModuleDependency<AcornJSModule>[]) {
        var preamble = deps.map(d => d.source?.extractShebang()).find(x => x),
            contents = this.readAll(deps),
            init = this.require(deps.filter(d => d.source));

        return [preamble].concat(...contents).concat(init).join('\n');
    }

    readAll(deps: ModuleDependency<AcornJSModule>[]) {
        return deps.map(d => (d.compiled || []).map(ref =>
            ref instanceof SourceFile && ref.contentType === 'js' ?
                ref.readSync()
            : ref instanceof TransientCode && ref.contentType === 'js' ?
                ref.content
            : undefined
        ).filter(x => x));
    }

    require(deps: ModuleDependency<AcornJSModule>[]) {
        var keys = deps.map(d => d.target.normalize().canonicalName);
        return `{ let c = kremlin.requires(${JSON.stringify(keys)}); if (typeof module !== 'undefined') module.exports = c; }`;
    }
}



export { PassThroughModule, JsonModule, ConcatenatedJSModule }