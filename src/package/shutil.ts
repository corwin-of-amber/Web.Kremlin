import fs from 'fs';
import path from 'path';
import child_process from 'child_process';


function ln_sf(target: string, path: string) {
    try {
        fs.lstatSync(path);
        fs.unlinkSync(path);
    }
    catch { }
    fs.symlinkSync(target, path);
}

function cp_r(src: string, destDir: string) {
    // :(
    child_process.execSync(`cp -r '${src}' '${destDir}'`);
}

function linkrel(target: string, linkPath: string) {
    var linkDir = path.dirname(linkPath);
    ln_sf(path.relative(linkDir, target), linkPath);
}


function ifExists(filename: string) {
    try   { fs.statSync(filename); return filename }
    catch { return undefined; }
}

function touch(filename: string) {
    var tm = new Date;
    fs.utimesSync(filename, tm, tm);
}


export { ln_sf, cp_r, linkrel, ifExists, touch }