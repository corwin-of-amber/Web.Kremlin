// build with
//  parcel build --no-minify --target node --public-url=. src/plug.ts
import path from 'path';
import { ProjectDefinition, ProjectDefinitionNorm } from './project';
import { Builder } from './build';



class Kremlin {

    proj: ProjectDefinitionNorm

    get console() {
        return (this.proj && (<any>this.proj.window).console) || console;
    }

    build(proj: ProjectDefinition) {
        var b = new Builder(proj);
        this.proj = b.proj;
        return b.build();
    }

    watch(projdef: ProjectDefinition = {}) {
        const fs = (0||require)('fs') as typeof import('fs');
        var proj = ProjectDefinition.normalize(projdef),
            console = (<any>proj.window).console || this.console;

        var watcher = fs.watch(proj.wd, {persistent: false, recursive: true}, 
            (_event, filename) => {
                if (filename && this._ignored(filename)) return ;
                console.log(`%c[changed] ${filename}`, 'color: #bbb');
            });
        
        proj.window.addEventListener('unload', () => watcher.close());
    }

    reboot() { 
        for (let k in global.require.cache) {
            if (global.require.cache[k].exports === module.exports) {
                delete global.require.cache[k];
                break;
            }
        }
    }

    _ignored(filename: string) {
        return this._ignoreFuncs.some(f => { 
            try { return f(filename); } catch (e) { this.console.error(e); }
        });
    }

    _ignoreFuncs: ((filename: string) => boolean)[] = [
        (filename) => filename.split(path.sep).some(
            (x) => x[0] == '.' || x == 'node_modules' || x == 'bower_components'),
        (filename) => !!/^\d+$/.exec(filename)
    ];
}



module.exports = new Kremlin;
