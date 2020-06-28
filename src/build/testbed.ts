import $ from 'jquery';
import { AcornCrawl } from './bundle';
import { DummyCompiler } from './compile';
import { ModuleDepNavigator } from './ui/introspect';



async function testbed() {
    var ac = new AcornCrawl();

    var compiler = new DummyCompiler();

    ac.compilers.push(compiler);

    var entryp = '/Users/corwin/var/workspace/Web.Author/src/hub.ls',
        m = ac.visit(entryp);

    console.log(m);

    var nav = new ModuleDepNavigator(ac, entryp);
    $(() => document.body.append(nav.view.$el));

    Object.assign(window, {ac, m, nav});
}

testbed();