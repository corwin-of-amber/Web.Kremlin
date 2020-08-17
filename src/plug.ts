// build with
//  parcel build --no-minify --target node --public-url=. src/plug.ts
import path from 'path';
import { FSWatcher } from 'fs';
import _ from 'lodash';
import { ProjectDefinition, ProjectDefinitionNorm } from './project';
import { Builder } from './build';
import { ReportToConsole } from './build/ui/report';



class Kremlin {

    proj: ProjectDefinitionNorm
    builder: Builder
    watcher: FSWatcher

    persist: boolean = false  // whether to keep app running while watch is active

    get console() {
        return (this.proj && (<any>this.proj.window).console) || console;
    }

    prepare(proj: ProjectDefinition = this.proj || {}) {
        var b = new Builder(proj, this.builder && this.builder.env);
        this.proj = b.proj;
        b.env.report = new ReportToConsole(this.console);
        this.builder = b;
    }

    build(proj?: ProjectDefinition) {
        this.prepare(proj);
        this.builder.build();
        return this;
    }

    reload(proj?: ProjectDefinition) {
        var wasWatching = !!this.watcher;
        this.unwatch();
        this.build(proj);
        if (this.isOk() && this._reload()) { }
        else if (wasWatching)
            setTimeout(() => this._watch(), 1000);
    }

    watch(proj?: ProjectDefinition, persist = this.persist) {
        this.prepare(proj);
        this.persist = persist;
        this._watch();
        return this;
    }

    _watch() {
        const fs = (0||require)('fs') as typeof import('fs');
        var proj = this.proj;

        var trigger = _.debounce(() => this.reload(), 200);

        var watcher = fs.watch(proj.wd, {persistent: this.persist, recursive: true}, 
            (_event, filename) => {
                if (filename && this._ignored(filename)) return ;
                this.console.log(`%c[changed] ${filename}`, 'color: #bbb');
                trigger();
            });

        this.watcher = watcher;
        
        if (proj.window.addEventListener)
            proj.window.addEventListener('unload', () => watcher.close());
    }

    unwatch() {
        if (this.watcher) this.watcher.close();
        this.watcher = undefined;
        return this;
    }

    buildWatch(proj?: ProjectDefinition, persist = this.persist) {
        this.build(proj);
        // allow fsevents time to settle
        setTimeout(() => this.watch(proj, persist), 1000);
    }

    reboot() { 
        for (let k in global.require.cache) {
            if (global.require.cache[k].exports === module.exports
                || global.require.cache[k].exports === instance) {
                delete global.require.cache[k];
            }
        }
        this._reload();
    }

    isOk() {
        return this.builder && this.builder.isOk();
    }

    _reload() {
        if (this.proj && this.proj.window.location) {
            this.proj.window.location.reload();
            return true;
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
        (filename) => !!/^\d+$/.exec(filename),
        (filename) => this.proj && filename.startsWith(this.proj.buildDir)
    ];
}



var instance = new Kremlin;
export default instance;
