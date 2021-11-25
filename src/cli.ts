#!/usr/bin/env node
import commander from 'commander';
import type { ProjectDefinition } from './project';
import _ from './plug';

async function command(argv: string[]) {
    var prog = commander
        .description('Kremlin bundler command-line interface');

    prog.command('build', {isDefault: true})
        .usage('[options] <entry-points>')
        .option('-o, --out-dir <dir>', "output directory [build/kremlin]")
        .option('-w, --watch', "watch for file changes")
        .option('-p, --prod', "production mode (concatenate JS)")
        .option('--node', "target Node.js environment " + 
                          "(do not shim builtin modules)")
        .action(build);

    prog.command('launcher')
        .option('-m, --mac', "create a `.app` bundle for macOS")
        .option('--nw <dir>', "path to nwjs (needs to contain `nwjs.app`)")
        .action(launcher);

    await prog.parseAsync(argv);
}

async function build(o: any) {
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

async function launcher(o: any) {
    // currently only Mac is supported
    (await import('./package/launcher-mac')).main({nwPath: o.nw});
}

command(process.argv);