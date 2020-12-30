/**
 * Generates a Mac application launcher.
 */

import fs from 'fs';
import path from 'path';

import which from 'which';
import mkdirp from 'mkdirp';

import { linkrel, cp_r, touch, ifExists } from './shutil';

import { PackageDir } from '../build/modules';



class NWjsOrigin {
    rootDir: string
    appDir: string

    constructor() {
        this.rootDir = fs.realpathSync(resolveg('nw'));
        this.appDir = path.join(this.rootDir, 'nwjs/nwjs.app');
        if (!ifExists(this.appDir))
            throw new Error(`missing NWjs app dir '${this.appDir}'`);
    }
}

function resolveg(module: string) {
    var nodeExec = which.sync('node') || process.execPath,
        modulesPath: string, mod: string;
    if (!(modulesPath = ifExists(path.join(nodeExec, '../../lib/node_modules'))))
        throw new Error("could not find global 'node_modules' path");
    if (!(mod = ifExists(path.join(modulesPath, module))))
        throw new Error("could not find global module 'nw'");
    return mod;
}


class AppDir {
    name: string
    rootDir: string
    appDir: string

    constructor(name: string, rootDir: string = '.') {
        this.name = name;
        this.rootDir = rootDir;
        this.appDir = path.join(this.rootDir, `${name}.app`);
    }

    create(structure: any, locations = {}) {
        this.process([], structure, locations);
        touch(this.appDir);
    }

    process(rel: string[], structure: any, locations = {}) {
        var here = path.join(this.appDir, ...rel);
        if (structure instanceof Ref) {
            structure.create(here, locations);
        }
        else {
            mkdirp.sync(here);
            for (let [k, v] of Object.entries(structure)) {
                this.process([...rel, k], v, locations);
            }
        }
    }
}

abstract class Ref {
    origin: string
    rel: string
    constructor(origin: string, rel: string) { this.origin = origin; this.rel = rel; }
    path(locations = {}) {
        return path.join(locations[this.origin]!, this.rel);
    }
    abstract create(at: string, locations: {}): void
}

class SymbolicLink extends Ref {
    create(at: string, locations = {}) {
        linkrel(this.path(locations), at);
    }
}

class CopyOver extends Ref {
    create(at: string, locations = {}) {
        cp_r(this.path(locations), at);
    }
}

const structure = {
    Contents: {
        PkgInfo: new CopyOver('nw', 'Contents/PkgInfo'),
        'Info.plist': new CopyOver('nw', 'Contents/Info.plist'),
        Frameworks: new SymbolicLink('nw', 'Contents/Frameworks'),
        MacOS: new CopyOver('nw', 'Contents/MacOS'),
        Resources: {
            'app.icns': new SymbolicLink('nw', 'Contents/Resources/app.icns'),
            'app.nw': new SymbolicLink('pkg', '')
        }
    }
}


function main() {
    var nw = new NWjsOrigin(),
        pkg = new PackageDir('.'),
        app = new AppDir(path.basename(process.cwd()), pkg.dir);
    var banner = ["-".repeat(60),
                  `Creating:  ${app.appDir}`,
                  `NWjs:      ${nw.appDir}`,   "-".repeat(60)];

    console.log(banner.join('\n'));

    console.log(pkg.canonicalName);

    var m = pkg.manifest,
        icon = m?.app?.icon;

    if (icon) {
        console.log(`Icon = ${icon}`);
        structure.Contents.Resources['app.icns'] = new CopyOver('pkg', icon);
    }

    app.process([], structure, {'nw': nw.appDir, 'pkg': pkg.dir});
}


main();