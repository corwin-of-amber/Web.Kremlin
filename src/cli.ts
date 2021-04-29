#!/usr/bin/env node
import commander from 'commander';
import type { ProjectDefinition } from './project';
import _ from './plug';

function command(argv: string[]) {
    var o = commander
        .description('Kremlin bundler command-line interface')
        .usage('[options] <entry-points>')
        .option('-o, --out-dir <dir>', "output directory [build/kremlin]")
        .option('-w, --watch', "watch for file changes")
        .option('-p, --prod', "production mode (concatenate JS)")
        .option('--node', "target Node.js environment " + 
                          "(do not shim builtin modules)")
        .parse(argv);

    if (o.args.length == 0) return o.outputHelp();

    var proj: ProjectDefinition = {main: o.args};
    if (o.outDir) proj.buildDir = o.outDir;
    _.opts.mode = o.prod ? 'prod' : 'dev';
    _.opts.target = o.node ? 'node' : 'browser';

    if (o.watch)
        _.buildWatch(proj, true)
    else
        _.build(proj);
}

command(process.argv);