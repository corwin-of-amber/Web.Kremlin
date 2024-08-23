import fs, { readdirSync } from 'fs';

function mustUse() {
    console.log(fs.existsSync);  /* bug: becomes `_0.default.existsSync` */
    console.log(readdirSync);
}

mustUse();