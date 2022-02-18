import { Environment } from '../environment';
import { ModuleRef, SourceFile } from '../modules';


interface Report {
    visit(ref: ModuleRef): void
    error(ref: ModuleRef, err: any): void
    warn(ref: ModuleRef, msg: any): void
    deploy(outFilename: string): void
    status: Status
}

namespace Report {
    export enum Status { OK, ERROR }
}

type Status = Report.Status;
const Status = Report.Status;


class ReportSilent implements Report {
    visit(ref: ModuleRef) { }
    error(ref: ModuleRef, err: any) { this.status = Status.ERROR; }
    warn(ref: ModuleRef, msg: any) {  }
    deploy(outFilename: string) { }
    status: Status = Status.OK
}


class ReportToConsole implements Report {
    console: typeof console
    status: Status = Status.OK

    _lastSf: SourceFile

    constructor(consol: typeof console) {
        this.console = consol;
    }

    visit(ref: ModuleRef) {
        if (ref instanceof SourceFile) {
            this.console.log(`%cvisit ${ref.filename}`, 'color: #8080ff');
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

    deploy(outFilename: string) {
        this.console.log(`%c> ${outFilename}`, "color: #ff8080");
    }
}


export { Report, ReportSilent, ReportToConsole }