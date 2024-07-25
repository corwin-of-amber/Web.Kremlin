import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';


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

function main() {
    const tmpdir = mktempdir();

    function runTest(fn: string) {
        runCmd(['kremlin', 'build', '-o', tmpdir, fn]);
        let p = child_process.fork(`${tmpdir}/${path.basename(fn).replace(/[.]ts$/, '.js')}`);
        p.on('error', (e) => console.error(e));
        p.on('exit', (rc) => console.log(`exited (rc=${rc}).`));
    }

    runTest('tests/import-export/export-namespace.ts');
}

main();