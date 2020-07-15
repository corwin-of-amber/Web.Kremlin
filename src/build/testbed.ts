import $ from 'jquery';
import { SourceFile } from './modules';
import { AcornCrawl, NodeJSRuntime, SearchPath, HtmlModule } from './bundle';
import { Deployment } from './deploy';
import { DummyCompiler } from './transpile';
import { VueCompiler } from './addons/addon-vue';
import { LiveScriptCompiler } from './addons/addon-livescript';

import { ModuleDepNavigator } from './ui/introspect';



async function testbed() {
    var ac = new AcornCrawl([new NodeJSRuntime()]);

    var compilers = [new VueCompiler(),
                     new LiveScriptCompiler(),
                     new DummyCompiler(new SearchPath(['build'], []))];

    ac.compilers.push(...compilers);

    var entryp = new SourceFile('/Users/corwin/var/workspace/Web.Author/src/hub.ls');

    var deploy = new Deployment('/Users/corwin/var/workspace/Web.Author/build/kremlin');

    deploy.html = HtmlModule.fromSourceFile(new SourceFile('/Users/corwin/var/workspace/Web.Author/index.kremlin.html'));

    ac.collect([entryp]);
    for (let m of ac.modules.visited.values()) {
        console.log(m);
        deploy.addVisitResult(m);
    }

    for (let m of ac.modules.visited.values()) {
        if (!m.compiled) console.log("%cshim", 'color: red', m.origin);
    }

    deploy.makeIndexHtml(entryp);

    var nav = new ModuleDepNavigator(ac, entryp);
    $(() => document.body.append(nav.view.$el));

    Object.assign(window, {ac, deploy});
}

testbed();