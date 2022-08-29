import { Environment } from "./environment";
import { ModuleDependency } from "./modules";


interface CompilationUnit {
    env: Environment
    contentType: string
    process(key: string, deps: ModuleDependency[]): string | Uint8Array
}

/**
 * A base class for placeholder module stubs that are used when a
 * referenced module is missing or elided.
 */
abstract class CompilationUnitStub implements CompilationUnit {
    env: Environment;
    contentType: string;
    abstract process(key: string, deps: ModuleDependency<any>[]): string | Uint8Array
}


export { CompilationUnit, CompilationUnitStub }