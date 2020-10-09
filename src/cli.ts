import commander from 'commander';
import _ from './plug';

function command(argv: string[]) {
    var o = commander
        .description('Kremlin bundler command-line interface')
        .usage('[options] <entry-points>')
        .option('-w, --watch')
        .option('-p, --prod')
        .parse(argv);

    if (o.args.length == 0) return o.outputHelp();

    var proj = {main: o.args};
    _.opts.mode = o.prod ? 'prod' : 'dev';

    if (o.watch)
        _.buildWatch(proj, true)
    else
        _.build(proj);
}

command(process.argv);