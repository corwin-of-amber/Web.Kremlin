import path from 'path';   /* @kremlin.native */
import * as postcss from 'postcss';
import type { CompilationUnit } from '../bundle';
import { SourceFile, ModuleDependency } from '../modules';
import { InEnvironment } from '../environment';


class PostCSSModule extends InEnvironment implements CompilationUnit {
    dir?: string
    text: string
    contentType = 'css'
    ast: postcss.Root

    urls: string[] = []

    constructor(text: string, dir?: string) {
        super();
        this.dir = dir;
        this.text = text;
        this.ast = postcss.parse(text /*, {from: '...'} */)
    }

    process(key: string, deps: ModuleDependency[]) {
        /** @todo also need to interpolate deps */
        if (deps.length > 0)
            console.log('@todo interpolate', key, deps);
        return this.ast.toResult().css;
    }

    extractUrls() {
        this.ast.walkDecls(decl => {
            if (decl.value) {
                for (let mo of decl.value.matchAll(/url\((.*?)\)/g)) {
                    this.urls.push(this._strip(mo[1]));
                }
            }
        });
    }

    _strip(url: string) {
        var mo = url.match(/^"(.*)"$/) ?? url.match(/^'(.*)'$/);
        return mo ? mo[1] : url;
    }

    static fromSourceFile(m: SourceFile) {
        return new this(m.readSync(), path.dirname(m.filename));
    }
}


export { PostCSSModule }