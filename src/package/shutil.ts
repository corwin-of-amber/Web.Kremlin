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

function rm_rf(path: string) {
    // :(
    child_process.execSync(`rm -rf '${path}'`);
}

function cp_r(src: string, dest: string) {
    if (!src.endsWith('/') && isDirectory(src))
        src += '/';
    rm_rf(dest);
    // :(
    child_process.execSync(`cp -r '${src}' '${dest}'`);
}

function linkrel(target: string, linkPath: string) {
    var linkDir = path.dirname(linkPath);
    ln_sf(path.relative(linkDir, target), linkPath);
}


function ifExists(filename: string) {
    try   { fs.statSync(filename); return filename }
    catch { return undefined; }
}

function isDirectory(path: string) {
    return fs.statSync(path).isDirectory();
}

function touch(filename: string) {
    var tm = new Date;
    fs.utimesSync(filename, tm, tm);
}


export { ln_sf, rm_rf, cp_r, linkrel, ifExists, isDirectory, touch }