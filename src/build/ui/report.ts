import path from 'path';
import { Environment } from '../environment';
import { ProjectDefinitionNorm } from '../../project';
import { ModuleRef, SourceFile, StubModule } from '../modules';
import { CompilationUnit, CompilationUnitStub } from '../compilation-unit';


interface Report {
    start(proj: ProjectDefinitionNorm): void
    visit(ref: ModuleRef): void
    error(ref: ModuleRef, err: any): void
    warn(ref: ModuleRef, msg: any): void
    info(ref: ModuleRef, msg: any): void
    deploy(outFilename: string): void
    summary(ref: ModuleRef, cu?: CompilationUnit): void
    status: Status
}

namespace Report {
    export enum Status { OK, ERROR }
}

type Status = Report.Status;
const Status = Report.Status;


class ReportSilent implements Report {
    start(proj: ProjectDefinitionNorm) { }
    visit(ref: ModuleRef) { }
    error(ref: ModuleRef, err: any) { this.status = Status.ERROR; }
    warn(ref: ModuleRef, msg: any) {  }
    info(ref: ModuleRef, msg: any) {  }
    deploy(outFilename: string) { }
    summary(ref: ModuleRef, cu?: CompilationUnit) { }
    status: Status = Status.OK
}


class ReportToConsole implements Report {
    console: typeof console
    status: Status = Status.OK

    _wd: string /* workdir, for reporting filenames */
    _lastSf: SourceFile

    constructor(consol: typeof console) {
        this.console = consol;
    }

    start(proj: ProjectDefinitionNorm) {
        this._wd = proj.wd;
    }

    visit(ref: ModuleRef) {
        if (ref instanceof SourceFile) {
            let fn = path.relative(this._wd, ref.filename);
            if (fn.startsWith('.')) fn = ref.filename;
            this.console.log(`%cvisit ${fn}`, 'color: #8080ff');
            this._lastSf = ref;
        }
    }

    error(ref: ModuleRef, err: any) {
        /* Avoid unwanted recursion if `ref.canonicalName` itself reports an error,
         * e.g. if `package.json` has been removed */
        Environment.runIn(Environment.NULL(), () => {
            try   { var where = ref.canonicalName; }
            catch { where = this._lastSf?.canonicalName || '(unknown)'; }
            this.console.log(`%cerror in ${where}`, 'color: #3030ff');
            this.console.error(err);
            this.status = Status.ERROR;
        });
    }

    warn(ref: ModuleRef, msg: any) {
        console.warn(msg);
    }

    info(ref: ModuleRef, msg: any) {
        console.info(`%c[%s] %s`, "color: #ffaaaa", ref.canonicalName, msg);
    }

    deploy(outFilename: string) {
        this.console.log(`%c> ${outFilename}`, "color: #ff8080");
    }

    /**
     * Report external and missing modules
     * @param ref original module reference
     * @param cu compiled module (if any)
     */
    summary(ref: ModuleRef, cu?: CompilationUnit) {
        if (!cu)
            console.log("%c[external]", 'color: red', ref);
        else if (cu instanceof CompilationUnitStub)
            console.log("%c[skipped]", 'color: red', ...(
                ref instanceof StubModule ?
                    [ref.name, ref.reason.repr ?? ref.reason] : [ref]));
    }
}


export { Report, ReportSilent, ReportToConsole }