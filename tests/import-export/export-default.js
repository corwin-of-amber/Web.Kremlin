import { writeFileSync, readFileSync } from 'fs';

class DefExport { }

export default {
    instance: new DefExport(),
    directives: {
        writeFileSync,
        read: readFileSync
    }
}
