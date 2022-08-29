import { SourceFile, PackageDir } from './modules';
import { Environment, NodeJSRuntime, BrowserShims,
         NodeJSPolicy, BrowserPolicy, Library} from './environment';
import { UserDefinedProjectOptions,
         UserDefinedOverrides, UserDefinedAssets } from './configuration';
import { AcornCrawl, SearchPath, VisitResult } from './bundle';
import { Deployment } from './deploy';
import { AssetBundler, DummyCompiler } from './transpile';
import { DevAdjustments, ProdAdjustments } from './adjustments';
import { ProjectDefinition, ProjectDefinitionNorm, resolve } from '../project';
import { Report } from './ui/report';

import { TypeScriptCompiler } from './addons/addon-typescript';
import { VueCompiler } from './addons/addon-vue';
import { LiveScriptCompiler } from './addons/addon-livescript';
import { SASSCompiler } from './addons/addon-sass';



class Builder {

    env: Environment
    proj: ProjectDefinitionNorm
    wd: PackageDir
    entryp: SourceFile[]

    opts: BuildOptions

    userModules: UserDefinedOverrides
    userAssets: UserDefinedAssets

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
        var shims: Library = undefined;
        switch (this.opts.target) {
        case 'node':
            this.env.policy = new NodeJSPolicy;
            break;
        case 'browser':
            this.env.policy = new BrowserPolicy;
            shims = new BrowserShims();
            break;
        }
        switch (this.opts.mode) {
        case 'dev':
            this.env.adjustments['html'] = [new DevAdjustments.Html];
            break;
        case 'prod':
            this.env.adjustments['html'] = [new ProdAdjustments.Html];
            break;            
        }

        var wd = this.wd = new PackageDir(this.proj.wd);
        Environment.runIn(this.env, () => {
            new UserDefinedProjectOptions(wd).apply(this.proj);
            this.userModules = new UserDefinedOverrides(wd);
            this.userAssets = new UserDefinedAssets(wd);
        });
        if (shims)
            this.env.infra.push(shims);
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

        for (let a of this.userAssets.assets) {
            deploy.addAsset(a);
        }

        for (let m of modules.values()) {
            deploy.addVisitResult(m);
        }

        if (this.opts.mode === 'prod') deploy.squelch();

        deploy.wrapUp(this.proj.main);

        /* Summary: report external and missing modules */
        for (let m of modules.values()) {
            this.env.report.summary(m.origin, m.compiled);
        }
    }

    isOk() {
        return this.env.report.status === Report.Status.OK;
    }

    configure() {
        var env = this.env, u = this.userModules;
        return (u && u.modules.length > 0) ?
            {...env, infra: env.infra.concat([u])} : env;
    }

    static defaultEnvironment() {
        var env = new Environment;
        env.infra = [new NodeJSRuntime()];
        env.compilers = [new TypeScriptCompiler(),
                         new VueCompiler(),
                         new LiveScriptCompiler(),
                         new SASSCompiler(),
                         new AssetBundler(),
                         new DummyCompiler(new SearchPath(['build'], []))];
        return env;
    }

    static DEFAULT_OPTIONS: BuildOptions = {mode: "dev", target: "browser"};
}

type BuildOptions = { mode?: "prod" | "dev", target?: "node" | "browser" };



export { Builder, BuildOptions }