import path from 'path';   /* @kremlin.native */

import * as postcss from 'postcss';

import type { CompilationUnit } from '../compilation-unit';
import { SourceFile, ModuleDependency } from '../modules';
import { InEnvironment } from '../environment';


class PostCSSModule extends InEnvironment implements CompilationUnit {
    dir?: string
    text: string
    contentType = 'css'
    ast: postcss.Root

    urls: Locator[] = []

    constructor(text: string, dir?: string) {
        super();
        this.dir = dir;
        this.text = text;
        this.ast = postcss.parse(text /*, {from: '...'} */)
    }

    process(key: string, deps: ModuleDependency<Locator>[]) {
        for (let {source: {node, expr}, deployed} of deps) {
            if (deployed.length === 1)
                node.value = node.value.replace(expr, `url(${deployed[0]})`);
            else
                console.warn(`css: cannot interpolate '${expr}' in ${key}`);
        }
        return this.ast.toResult().css;
    }

    extractUrls() {
        this.ast.walkDecls(decl => {
            if (decl.value) {
                for (let mo of decl.value.matchAll(/url\((.*?)\)/g)) {
                    this.urls.push({node: decl, expr: mo[0], url: this._strip(mo[1])});
                }
            }
        });
    }

    get localUrls() {
        return this.urls.filter(u => PostCSSModule.isLocalDependency(u.url));
    }

    _strip(url: string) {
        var mo = url.match(/^"(.*)"$/) ?? url.match(/^'(.*)'$/);
        return mo ? mo[1] : url;
    }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), path.dirname(m.filename));
    }

    static isLocalDependency(url: string) { 
        return !url.match(/^((https?|data):|[/])/);
    }
}

type Locator = {node: postcss.Declaration, expr: string, url: string};


export { PostCSSModule }