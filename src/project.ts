import path from 'path';

import { ModuleRef, SourceFile } from './build/modules';



type ProjectDefinition = {
    wd?: string
    main?: string | string[]
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
        return {
            wd: proj.wd || '.',
            main: targets(proj.main ? toArray(proj.main) : ['index.js']),
            buildDir: proj.buildDir || 'build/kremlin',
            window: proj.window || <Window>{}
        }
    }

    function toArray<T>(a : T | T[]) {
        return Array.isArray(a) ? a : [a];
    }

    function targets(defs: (string | TargetDefinition)[]) {
        return defs.map(target);
    }

    function target(targetdef: string | TargetDefinition) {
        if (typeof targetdef === 'string') {
            var mo = /^(.*\S)\s+=>\s+(.*)$/.exec(targetdef);
            if (mo)
                return {input: sources([mo[1]]), output: mo[2]};
            else {
                return {input: sources([targetdef]), output: guessOutputFor(targetdef)};
            }
        }
        else return targetdef;
    }

    function sources(filenames: string[]) {
        return filenames.map(fn => new SourceFile(fn));
    }

    function guessOutputFor(inputFilename: string) {
        return path.basename(inputFilename).replace(/[.](ts|ls)$/, '.js');
    }
}



export { ProjectDefinition, ProjectDefinitionNorm, TargetDefinition }
