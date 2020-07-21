const path = (0||require)('path') as typeof import('path');
import $ from 'jquery';

import { SourceFile } from './modules';
import { AcornCrawl, NodeJSRuntime, SearchPath, HtmlModule } from './bundle';
import { Deployment } from './deploy';
import { DummyCompiler } from './transpile';
import { TypeScriptCompiler } from './addons/addon-typescript';
import { VueCompiler } from './addons/addon-vue';
import { LiveScriptCompiler } from './addons/addon-livescript';

import { ModuleDepNavigator } from './ui/introspect';
import { ProjectDefinition } from '../project';



function testbed() {
    var ac = new AcornCrawl([new NodeJSRuntime()]);

    var compilers = [new TypeScriptCompiler(),
                     new VueCompiler(),
                     new LiveScriptCompiler(),
                     new DummyCompiler(new SearchPath(['build'], []))];

    ac.compilers.push(...compilers);

    var projects: {[name: string]: ProjectDefinition} = {
        kremlin: {
            wd: '.',
            main: ['index.kremlin.html', 'src/plug.ts']
        },
        author: {
            wd: '/Users/corwin/var/workspace/Web.Author',
            main: '/Users/corwin/var/workspace/Web.Author/src/hub.ls'
        }
    };

    var proj = ProjectDefinition.normalize(projects['kremlin']);

    var targets = proj.main.map(tgt => ({
        input: tgt.input.map(fn => new SourceFile(fn)),
        output: tgt.output
    }));

    var deploy = new Deployment(path.resolve(proj.wd, proj.buildDir));

    ac.collect([].concat(...targets.map(tgt => tgt.input)));
    for (let m of ac.modules.visited.values()) {
        console.log(m);
        deploy.addVisitResult(m);
    }

    for (let m of ac.modules.visited.values()) {
        if (!m.compiled) console.log("%cshim", 'color: red', m.origin);
    }

    deploy.wrapUp(targets);

    //deploy.makeIndexHtml();
    //deploy.concatenateJS('bundled.js', entryp);

    var nav = new ModuleDepNavigator(proj, ac);
    $(() => document.body.append(nav.view.$el));

    Object.assign(window, {ac, deploy});
}

testbed();