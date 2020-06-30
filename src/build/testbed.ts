import $ from 'jquery';
import { AcornCrawl, SearchPath, SourceFile, Deployment } from './bundle';
import { DummyCompiler } from './compile';
import { ModuleDepNavigator } from './ui/introspect';



async function testbed() {
    var ac = new AcornCrawl();

    var compiler = new DummyCompiler(new SearchPath(['build'], [])),
        deploy = new Deployment('build/kremlin');

    ac.compilers.push(compiler);

    var entryp = 'src/build/testbed.ts', //'/Users/corwin/var/workspace/Web.Author/src/hub.ls',
        m = ac.visitModuleRef(new SourceFile(entryp));

    console.log(m);
    deploy.addVisitResult(m)
    for (let d of m.deps) {
        deploy.addVisitResult(ac.visitModuleRef(d.target));
    }

    var nav = new ModuleDepNavigator(ac, entryp);
    $(() => document.body.append(nav.view.$el));

    Object.assign(window, {ac, m, nav});
}

testbed();