import { SourceFile, PackageDir } from './modules';
import { Environment, NodeJSRuntime, BrowserShims,
         NodeJSPolicy, BrowserPolicy} from './environment';
import { AcornCrawl, UserDefinedOverrides,
         SearchPath, VisitResult } from './bundle';
import { Deployment } from './deploy';
import { DummyCompiler } from './transpile';
import { TypeScriptCompiler } from './addons/addon-typescript';
import { VueCompiler } from './addons/addon-vue';
import { LiveScriptCompiler } from './addons/addon-livescript';
import { ProjectDefinition, ProjectDefinitionNorm, resolve } from '../project';
import { Report } from './ui/report';



class Builder {

    env: Environment
    proj: ProjectDefinitionNorm
    entryp: SourceFile[]

    opts: BuildOptions

    constructor(proj: ProjectDefinition = {}, env = Builder.defaultEnvironment(),
                options: BuildOptions = {}) {
        this.env = env;
        this.proj = ProjectDefinition.normalize(proj);
        this.entryp = [].concat(...this.proj.main.map(t => t.input));
        this.opts = {...Builder.DEFAULT_OPTIONS, ...options};
        this._configure();
    }

    /**
     * Configure environment using options.
     */
    _configure() {
        switch (this.opts.target) {
        case 'node':
            this.env.policy = new NodeJSPolicy;
            break;
        case 'browser':
            this.env.policy = new BrowserPolicy;
            this.env.infra.push(new BrowserShims());
            break;
        }
    }

    get console() {
        return (this.proj && (<any>this.proj.window).console) || console;
    }

    build() {
        Environment.runIn(this.env, () => {
            this.deploy(this.crawl());
            if (!this.isOk()) this.console.error("build failed.");
        });
    }

    crawl() {
        var ac = new AcornCrawl().in(this.configure());
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

        if (this.opts.mode === 'prod') deploy.squelch();

        deploy.wrapUp(this.proj.main);
    }

    isOk() {
        return this.env.report.status === Report.Status.OK;
    }

    configure() {
        var pd = new PackageDir(this.proj.wd), env = this.env,
            userModules = new UserDefinedOverrides(pd);
        return {...env, infra: env.infra.concat([userModules])};
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

    static DEFAULT_OPTIONS: BuildOptions = {mode: "dev", target: "browser"};
}

type BuildOptions = { mode?: "prod" | "dev", target?: "node" | "browser" };



export { Builder, BuildOptions }