import fs from 'fs';
import path from 'path';
import * as child_process from 'child_process';
import findUp from 'find-up';   /* @kremlin.native */
import { cp_r } from '../package/shutil';


const TEMPLATE_DIR = 'data/templates';

function create(dir = '.') {
    let fromDir = path.join(kremlinRoot(), TEMPLATE_DIR, 'bare'),
        toDir = dir;

    fs.mkdirSync(toDir, {recursive: true});

    for (let fn of fs.readdirSync(fromDir)) {
        cp_r(path.join(fromDir, fn), path.join(toDir, fn));
    }

    process.chdir(dir);
    child_process.execSync('npm i && ./_npmlink', {stdio: 'inherit'});

    return {main: ['index.html']};
}

function kremlinRoot() {
    return path.dirname(findUp.sync('package.json',
        {cwd: kremlin.meta.url.replace(/^file:\/\//, '')}));
}

declare var kremlin: {meta: {url: string}};  // using `kremlin` directly to allow this file to also compile as `module: commonjs`.


export { create }