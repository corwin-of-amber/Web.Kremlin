import { AcornCrawl, AcornJSModule } from './bundle';
import { Deployment } from './deploy';

/** @todo UI is broken since the Vue dependency no longer exists in the top-level package */
import { ModuleDepNavigator } from './ui/introspect';
import { ProjectDefinition, resolve } from '../project';
import { Builder } from '.';
import { ReportToConsole } from './ui/report';
import { Environment } from './environment';



function testbed() {
    var env = Builder.defaultEnvironment();
    env.report = new ReportToConsole(window.console);

    var ac = new AcornCrawl().in(env);

    var projects: {[name: string]: ProjectDefinition} = {
        kremlin: {
            wd: '.',
            main: ['index.html', 'src/plug.ts', 'src/cli.ts']
        },
        author: {
            wd: '/Users/corwin/var/workspace/Web.Author',
            main: 'src/hub.ls'
        },
        'tests/import-export': {
            wd: 'tests/import-export',
            main: 'index.js'
        },
        'tests/css-deps': {
            wd: 'tests/css-deps',
            main: 'index.js'
        }
    };

    var proj = ProjectDefinition.normalize(projects['tests/css-deps']);

    var targets = [].concat(...proj.main.map(t => t.input));

    var deploy = new Deployment(resolve(proj, proj.buildDir)).in(env);

    Environment.runIn(env, () => {
        ac.collect(targets);
        for (let m of ac.modules.visited.values()) {
            //console.log(m);
            deploy.addVisitResult(m);
        }

        for (let m of ac.modules.visited.values()) {
            if (!m.compiled) console.log("%cshim", 'color: red', m.origin);
        }

        deploy.wrapUp(proj.main);
    });

    /*
    var nav = new ModuleDepNavigator(proj, ac);
    $(() => document.body.append(nav.view.$el));  // todo use DOMContentLoaded
    */

    Object.assign(window, {ac, deploy, AcornJSModule});
}

testbed();