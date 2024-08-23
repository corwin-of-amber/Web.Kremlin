import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as commander from 'commander';


function runCmd(cmd: string[]) {
    console.log('>', cmd);
    child_process.spawnSync(cmd[0], cmd.slice(1), {stdio: 'inherit'});
}


function mktempdir() {
    const tmpdir = 'tmp';
    if (fs.existsSync(tmpdir))
        fs.rmSync(tmpdir, {recursive: true});
    return tmpdir;
}

async function main() {
    const tmpdir = mktempdir();

    function runTest(fn: string) {
        runCmd(['kremlin', 'build', '-o', tmpdir, fn]);
        let p = child_process.fork(`${tmpdir}/${path.basename(fn).replace(/[.]ts$/, '.js')}`);
        return new Promise((resolve, reject) => {
            p.on('error', (e) => { console.error(e); reject(e); });
            p.on('exit', (rc) => { console.log(`exited (rc=${rc}).`); resolve(rc); });
        });
    }

    let prog = new commander.Command()
        .arguments('<tests>')
    let o = prog.parse();

    for (let testFn of o.args) {
        await runTest(testFn);
    }
}

main();