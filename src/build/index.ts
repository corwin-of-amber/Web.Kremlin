import path from 'path';
import { SourceFile } from './modules';
import { AcornCrawl, NodeJSRuntime, SearchPath, HtmlModule, VisitResult } from './bundle';
import { Deployment } from './deploy';
import { DummyCompiler } from './transpile';
import { TypeScriptCompiler } from './addons/addon-typescript';
import { VueCompiler } from './addons/addon-vue';
import { LiveScriptCompiler } from './addons/addon-livescript';
import { ProjectDefinition, ProjectDefinitionNorm } from '../project';



class Builder {

    proj: ProjectDefinitionNorm
    entryp: SourceFile[]

    constructor(proj: ProjectDefinition = {}) {
        this.proj = ProjectDefinition.normalize(proj);
        this.entryp = [].concat(...this.proj.main.map(t => t.input));
    }

    get console() {
        return (this.proj && (<any>this.proj.window).console) || console;
    }

    build() {
        this.deploy(this.crawl());
    }

    crawl() {
        var ac = new AcornCrawl([new NodeJSRuntime()]);

        var compilers = [new TypeScriptCompiler(),
                         new VueCompiler(),
                         new LiveScriptCompiler(),
                         new DummyCompiler(new SearchPath(['build'], []))];

        ac.compilers.push(...compilers);

        return ac.collect(this.entryp);
    }

    deploy(modules: Map<string, VisitResult>) {
        let proj = this.proj, console = this.console;

        var deploy = new Deployment(proj.buildDir);

        for (let m of modules.values()) {
            console.log(m);
            deploy.addVisitResult(m);
        }

        for (let m of modules.values()) {
            if (!m.compiled) console.log("%cshim", 'color: red', m.origin);
        }

        deploy.wrapUp(this.proj.main);
    }
}



export { Builder }