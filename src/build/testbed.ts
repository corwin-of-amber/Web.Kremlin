import $ from 'jquery';
import { AcornCrawl, SearchPath, SourceFile, Deployment } from './bundle';
import { DummyCompiler, VueCompiler } from './transpile';
import { ModuleDepNavigator } from './ui/introspect';



async function testbed() {
    var ac = new AcornCrawl();

    var compilers = [new VueCompiler(),
                     new DummyCompiler(new SearchPath(['build'], []))],
        deploy = new Deployment('build/kremlin');

    ac.compilers.push(...compilers);

    var entryp = 'src/build/testbed.ts', //'/Users/corwin/var/workspace/Web.Author/src/hub.ls',
        m = ac.visitModuleRef(new SourceFile(entryp));

    console.log(m);
    //deploy.addVisitResult(m)
    //for (let d of m.deps) {
    //    deploy.addVisitResult(ac.visitModuleRef(d.target));
    //}

    var nav = new ModuleDepNavigator(ac, entryp);
    $(() => document.body.append(nav.view.$el));

    
    //var vc = new VueCompiler();
    //vc.compileFile('tree.vue');
    
    ac.collect([new SourceFile(entryp)]);
    for (let m of ac.modules.visited.values()) {
        console.log(m);
        deploy.addVisitResult(m);
    }

    Object.assign(window, {ac, m, nav});
}

testbed();