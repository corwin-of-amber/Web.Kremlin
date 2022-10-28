import assert from 'assert';
import path from 'path';
import * as parse5 from 'parse5';
import parse5Walk from 'walk-parse5'

import { Environment, InEnvironment } from '../environment';
import type { CompilationUnit } from '../compilation-unit';
import { GlobalDependencies, TextSource } from '../bundle';
import { SourceFile, ModuleRef, ModuleDependency } from '../modules';


class HtmlModule extends InEnvironment implements CompilationUnit {
    dir?: string
    text: string
    ast: parse5.Document
    contentType = 'html'

    scripts: parse5.DefaultTreeElement[]
    outDir?: string  /* location of intended output - for relative urls */

    constructor(text: string, dir?: string) {
        super();
        this.dir = dir;
        this.text = text;
        this.ast = parse5.parse(text, {sourceCodeLocationInfo: true});
    }

    extractScripts() {
        this.scripts = [];
        parse5Walk(this.ast, (node: parse5.DefaultTreeNode) => {
            if (node.nodeName === 'script')
                this.scripts.push(node as parse5.DefaultTreeElement);
        });
    }

    /**
     * Extracts script tags. Parses `kremlin://` URIs, if present;
     * otherwise it assumes that the `src` attribute contains a relative path.
     */
    getRefTags() {
        if (!this.scripts) this.extractScripts();
        return this.scripts.map(sc => {
            var src = sc.attrs.find(a => a.name == 'src');
            if (src) {
                var mo = /^kremlin:\/\/(.*)$/.exec(src.value);
                return {path: mo ? mo[1] : src.value, tag: sc};
            }
        }).filter(x => x);
    }

    process(key: string, deps: ModuleDependency[], globals?: GlobalDependencies) {
        if (!this.scripts) this.extractScripts();

        var entries = this.scripts.map(u => {
                var dep = deps.find(d => d.source === u);
                return dep && {tag: u, ref: dep.target};
            }).filter(x => x),
            includes = [...this.makeIncludeTags(deps)].join('\n');

        var text = this.text;
        if (entries.length > 0) {
            text = TextSource.interpolate(text, entries.map((e, i) => {
                var k = this.processScript(e.tag, e.ref, globals);
                if (i == 0) k.text = includes + '\n' + k.text;
                return k;
            }));
        }
        else text += '\n' + includes;

        return this.postprocess(text);
    }

    processScript(script: parse5.DefaultTreeElement, ref: ModuleRef, globals?: GlobalDependencies) {
        var loc = script.sourceCodeLocation;   assert(loc);
        var at = {start: loc.startOffset, end: loc.endOffset};
        return {text: this.makeInitScript(ref, globals), ...at};
    }

    *makeIncludeTags(deps: ModuleDependency[]) {
        for (let [cu, d] of this._uniqCUs(deps)) {
            yield this.makeIncludeTag(cu, d.target);
        }
    }

    makeIncludeTag(m: ModuleRef, origin: ModuleRef) {
        if (m instanceof SourceFile) {
            switch (m.contentType) {
            case 'js':  return this.makeScriptTag(m);
            case 'css': return this.makeStylesheetLinkTag(m) + this.makeScriptStub(origin);
            default:    return this.makeScriptStub(origin, this._urlOf(m));
            }
        }
        else throw new Error(`invalid html reference to '${m.constructor.name}'`);
    }

    makeScriptTag(m: SourceFile) {
        return `<script src="${this._urlOf(m)}"></script>`;
    }

    makeStylesheetLinkTag(m: SourceFile) {
        return `<link href="${this._urlOf(m)}" rel="stylesheet" type="text/${
                m.contentType || 'css'}">`;
    }

    makeScriptStub(ref: ModuleRef, content: any = {}) {
        return `<script>kremlin.m['${ref.canonicalName}'] = (mod) => { mod.exports = ${JSON.stringify(content)}; };</script>`;
    }

    makeInitScript(ref: ModuleRef, globals?: GlobalDependencies) {
        var key = ref.normalize().canonicalName,
            globmap = this.makeGlobals(globals);
        return `\n<script>kremlin.main('${key}', ${globmap});</script>`;
    }

    makeGlobals(globals?: GlobalDependencies) {
        /** @oops this is specific to `Buffer` */
        let buf = globals?.get('Buffer');
        if (buf)
            return `{Buffer: kremlin.require('${buf.normalize().canonicalName}').Buffer}`;
        else
            return undefined;
    }

    postprocess(text: string) {
        for (let pp of Environment.get().adjustments['html'] ?? [])
            text = pp.postprocess(text);
        return text;
    }

    _urlOf(m: SourceFile) {
        return this._rel(m.filename);
    }

    _rel(filename: string) {
        return this.outDir ? path.relative(this.outDir, filename) : filename;
    }

    /**
     * Remove duplicates; these may occur if some modules are coalesced.
     * (currently, this does not occur)
     */
     *_uniqCUs(deps: ModuleDependency[]): Generator<[ModuleRef, ModuleDependency]> {
        var seen = new Set<string>();
        for (let d of deps)
            for (let cu of d.compiled)
                if (!seen.has(cu.canonicalName)) 
                    { seen.add(cu.canonicalName); yield [cu, d]; }
    }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), path.dirname(m.filename));
    }
}


export { HtmlModule }