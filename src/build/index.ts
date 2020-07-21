import { SourceFile } from './modules';
import { Environment, AcornCrawl, NodeJSRuntime, SearchPath, VisitResult } from './bundle';
import { Deployment } from './deploy';
import { DummyCompiler } from './transpile';
import { TypeScriptCompiler } from './addons/addon-typescript';
import { VueCompiler } from './addons/addon-vue';
import { LiveScriptCompiler } from './addons/addon-livescript';
import { ProjectDefinition, ProjectDefinitionNorm, resolve } from '../project';



class Builder {

    env: Environment
    proj: ProjectDefinitionNorm
    entryp: SourceFile[]

    constructor(proj: ProjectDefinition = {}, env = Builder.defaultEnvironment()) {
        this.env = env;
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
        var ac = new AcornCrawl().in(this.env);
        return ac.collect(this.entryp);
    }

    deploy(modules: Map<string, VisitResult>) {
        let proj = this.proj, console = this.console;

        var deploy = new Deployment(resolve(proj, proj.buildDir)).in(this.env);

        for (let m of modules.values()) {
            deploy.addVisitResult(m);
        }

        for (let m of modules.values()) {
            if (!m.compiled) console.log("%cshim", 'color: red', m.origin);
        }

        deploy.wrapUp(this.proj.main);
    }

    static defaultEnvironment() {
        var env = new Environment;
        env.infra = [new NodeJSRuntime()];
        env.compilers = [new TypeScriptCompiler(),
                         new VueCompiler(),
                         new LiveScriptCompiler(),
                         new DummyCompiler(new SearchPath(['build'], []))];
        return env;
    }
}



export { Builder }