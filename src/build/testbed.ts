const path = (0||require)('path') as typeof import('path');
import $ from 'jquery';

import { AcornCrawl } from './bundle';
import { Deployment } from './deploy';

import { ModuleDepNavigator } from './ui/introspect';
import { ProjectDefinition, resolve } from '../project';
import { Builder } from '.';
import { ReportToConsole } from './ui/report';



function testbed() {
    var env = Builder.defaultEnvironment();
    env.report = new ReportToConsole(window.console);

    var ac = new AcornCrawl().in(env);

    var projects: {[name: string]: ProjectDefinition} = {
        kremlin: {
            wd: '.',
            main: ['index.kremlin.html', 'src/plug.ts', 'src/cli.ts']
        },
        author: {
            wd: '/Users/corwin/var/workspace/Web.Author',
            main: 'src/hub.ls'
        }
    };

    var proj = ProjectDefinition.normalize(projects['kremlin']);

    var targets = [].concat(...proj.main.map(t => t.input));

    var deploy = new Deployment(resolve(proj, proj.buildDir)).in(env);

    ac.collect(targets);
    for (let m of ac.modules.visited.values()) {
        //console.log(m);
        deploy.addVisitResult(m);
    }

    for (let m of ac.modules.visited.values()) {
        if (!m.compiled) console.log("%cshim", 'color: red', m.origin);
    }

    deploy.wrapUp(proj.main);

    var nav = new ModuleDepNavigator(proj, ac);
    $(() => document.body.append(nav.view.$el));

    Object.assign(window, {ac, deploy});
}

testbed();