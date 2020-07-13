import $ from 'jquery';
import { AcornCrawl, NodeJSRuntime, SearchPath, SourceFile, HtmlModule } from './bundle';
import { Deployment } from './deploy';
import { DummyCompiler, VueCompiler } from './transpile';
import { ModuleDepNavigator } from './ui/introspect';



async function testbed() {
    var ac = new AcornCrawl([new NodeJSRuntime()]);

    var compilers = [new VueCompiler(),
                     new DummyCompiler(new SearchPath(['build'], []))];

    ac.compilers.push(...compilers);

    var entryp = /*'src/build/testbed.ts', */'/Users/corwin/var/workspace/Web.Author/src/hub.ls',
        m = ac.visitModuleRef(new SourceFile(entryp));

    console.log(m);
    //deploy.addVisitResult(m)
    //for (let d of m.deps) {
    //    deploy.addVisitResult(ac.visitModuleRef(d.target));
    //}

    var nav = new ModuleDepNavigator(ac, entryp);
    $(() => document.body.append(nav.view.$el));

    
    var deploy = new Deployment('/Users/corwin/var/workspace/Web.Author/build/kremlin');

    deploy.html = HtmlModule.fromSourceFile(new SourceFile('/Users/corwin/var/workspace/Web.Author/index.kremlin.html'));
    //var vc = new VueCompiler();
    //vc.compileFile('tree.vue');
    
    ac.collect([new SourceFile(entryp)]);
    for (let m of ac.modules.visited.values()) {
        console.log(m);
        deploy.addVisitResult(m);
    }

    for (let m of ac.modules.visited.values()) {
        if (!m.compiled) console.log("%cshim", 'color: red', m.origin);
    }

    deploy.makeIndexHtml(m.origin);

    Object.assign(window, {ac, m, nav, deploy});
}

testbed();