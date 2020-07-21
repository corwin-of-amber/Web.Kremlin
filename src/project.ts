import path from 'path';



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
    input: string[]
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
            return {input: [targetdef], output: path.basename(targetdef)};
        }
        else return targetdef;
    }
}


export { ProjectDefinition, ProjectDefinitionNorm, TargetDefinition }
