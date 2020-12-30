/**
 * Generates a Mac application launcher.
 */

import fs from 'fs';
import path from 'path';
import requireg from 'requireg';

import mkdirp from 'mkdirp';
import { linkrel, cp_r, touch } from './shutil';

import { PackageDir } from '../build/modules';



class NWjsOrigin {
    rootDir: string
    appDir: string

    constructor() {
        this.rootDir = path.dirname(fs.realpathSync(requireg.resolve('nw')));
        this.appDir = path.join(this.rootDir, 'nwjs/nwjs.app');
    }
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
        app = new AppDir(path.basename(process.cwd()));
    var banner = ["-".repeat(60),
    `Creating:  ${app.appDir}`,
    `NWjs:      ${nw.appDir}`, "-".repeat(60)];

    console.log(banner.join('\n'));

    app.process([], structure, {'nw': nw.appDir, 'pkg': app.rootDir});
}


main();