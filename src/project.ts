import path from 'path';

import { ModuleRef, SourceFile } from './build/modules';



type ProjectDefinition = {
    wd?: string
    main?: string | (string | TargetDefinition)[]
    buildDir?: string
    window?: Window
}

type ProjectDefinitionNorm = {
    wd: string
    main: TargetDefinition[]
    buildDir: string
    window?: Window
}

type TargetDefinition = {
    input: ModuleRef[]
    output: string
}


namespace ProjectDefinition {
    export function normalize(proj: ProjectDefinition): ProjectDefinitionNorm {
        var norm: ProjectDefinitionNorm = {
            wd: proj.wd || '.',
            main: [],
            buildDir: proj.buildDir || 'build/kremlin',
            window: proj.window || <Window>{}
        };
        norm.main = targets(proj.main ? toArray(proj.main) : defaultEntry(norm), norm);
        return norm;
    }

    function toArray<T>(a : T | T[]) {
        return Array.isArray(a) ? a : [a];
    }

    function targets(defs: (string | TargetDefinition)[], proj: ProjectDefinitionNorm) {
        return defs.map(d => target(d, proj));
    }

    function target(targetdef: string | TargetDefinition, proj: ProjectDefinitionNorm) {
        if (typeof targetdef === 'string') {
            var mo = /^(.*\S)\s+=>\s+(.*)$/.exec(targetdef);
            if (mo)
                return {input: sources([mo[1]], proj), output: mo[2]};
            else {
                return {input: sources([targetdef], proj), output: guessOutputFor(targetdef)};
            }
        }
        else return targetdef;
    }

    function sources(filenames: string[], proj: ProjectDefinitionNorm) {
        return filenames.map(fn => new SourceFile(resolve(proj, fn)));
    }

    function defaultEntry(proj: ProjectDefinitionNorm) {
        var loc = proj.window.location?.href;
        return loc ? [loc.replace(/.*\//, '')] : ['index.js'];
    }

    function guessOutputFor(inputFilename: string) {
        return path.basename(inputFilename).replace(/[.](ts|ls)$/, '.js');
    }
}


function resolve(proj: ProjectDefinitionNorm, ...paths: string[]) {
    var p = proj.wd;
    for (let el of paths)
        p = el.startsWith('/') ? el : path.join(p, el)
    return p;
}



export { ProjectDefinition, ProjectDefinitionNorm, TargetDefinition, resolve }
