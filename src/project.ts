

type ProjectDefinition = {
    wd?: string
    main?: string | string[]
    html?: string
    buildDir?: string
    window?: Window
}

type ProjectDefinitionNorm = {
    wd: string
    main: string[]
    html?: string
    buildDir: string
    window?: Window
}


namespace ProjectDefinition {
    export function normalize(proj: ProjectDefinition): ProjectDefinitionNorm {
        return {
            wd: proj.wd || '.',
            main: proj.main ?
                (typeof proj.main == 'string' ? [proj.main] : proj.main) 
                : ['index.js'],
            html: proj.html,
            buildDir: proj.buildDir || 'build/kremlin',
            window: proj.window || <Window>{}
        }
    }
}


export { ProjectDefinition, ProjectDefinitionNorm }
