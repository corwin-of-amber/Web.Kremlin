/**
 * Generates a Mac application launcher.
 */

import fs from 'fs';
import path from 'path';
import requireg from 'requireg';


class NWjsOrigin {
    rootDir: string

    constructor() {
        this.rootDir = path.dirname(fs.realpathSync(requireg.resolve('nw')));
    }
}


function main() {
    var nw = new NWjsOrigin();
    console.log(nw.rootDir);
}


main();