import assert from 'assert';
import path from 'path';
import * as parse5 from 'parse5';
import parse5Walk from 'walk-parse5'

import { Environment, InEnvironment } from '../environment';
import type { CompilationUnit } from '../bundle';
import { TextSource } from '../bundle';
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

    process(key: string, deps: ModuleDependency[]) {
        if (!this.scripts) this.extractScripts();

        var entries = this.scripts.map(u => {
            var dep = deps.find(d => d.source === u);
            return dep && {tag: u, ref: dep.target};
        }).filter(x => x);

        var tags = [].concat(...[...this._uniqCUs(deps)].map(([d, c]) =>
            this.makeIncludeTag(c, d.target))
        ).join('\n');

        var text = this.text;
        if (entries.length > 0) {
            text =  TextSource.interpolate(text, entries.map((e, i) => {
                var k = this.processScript(e.tag, e.ref);
                if (i == 0) k.text = tags + '\n' + k.text;
                return k;
            }));
        }
        else text += '\n' + tags;

        return this.postprocess(text);
    }

    processScript(script: parse5.DefaultTreeElement, ref: ModuleRef) {
        var loc = script.sourceCodeLocation;   assert(loc);
        var at = {start: loc.startOffset, end: loc.endOffset};
        return {text: this.makeInitScript(ref), ...at};
    }

    *_uniqCUs(deps: ModuleDependency[]): Generator<[ModuleDependency, ModuleRef]> {
        // Remove duplicates (these can occur if some modules are bundled)
        var seen = new Set<string>();
        for (let d of deps)
            for (let c of d.compiled)
                if (!seen.has(c.canonicalName)) 
                    { seen.add(c.canonicalName); yield [d, c]; }
    }

    makeIncludeTag(m: ModuleRef, origin: ModuleRef) {
        if (m instanceof SourceFile) {
            switch (m.contentType) {
            case 'js': return this.makeScriptTag(m);
            case 'css': return this.makeStylesheetLinkTag(m) + this.makeScriptStub(origin);
            default: return '';
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

    makeScriptStub(ref: ModuleRef) {
        return `<script>kremlin.m['${ref.canonicalName}'] = () => ({});</script>`;
    }

    makeInitScript(ref: ModuleRef) {
        var key = ref.normalize().canonicalName;
        return `\n<script>kremlin.require('${key}');</script>`;
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

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), path.dirname(m.filename));
    }
}


export { HtmlModule }