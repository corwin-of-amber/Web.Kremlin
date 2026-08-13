import assert from 'assert'; /** @kremlin.native */
import fs, { readdirSync } from 'fs';
import sf from 'fs';

function mustUse() {
    console.log(sf.existsSync);  /* this is just for reference */
    console.log(fs.existsSync);
    assert(sf.existsSync === fs.existsSync, 'INCORRECT');
    console.log(readdirSync);
}

mustUse();