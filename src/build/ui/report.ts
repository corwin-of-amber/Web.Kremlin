import { ModuleRef, SourceFile } from '../modules';


interface Report {
    visit(ref: ModuleRef): void
    error(ref: ModuleRef, err: any): void
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
    deploy(outFilename: string) { }
    status: Status = Status.OK
}


class ReportToConsole implements Report {
    console: typeof console
    status: Status = Status.OK

    constructor(consol: typeof console) {
        this.console = consol;
    }

    visit(ref: ModuleRef) {
        if (ref instanceof SourceFile)
            this.console.log(`%cvisit ${ref.filename}`, 'color: #8080ff');
    }

    error(ref: ModuleRef, err: any) { 
        this.console.log(`%cerror in ${ref.canonicalName}`, 'color: #3030ff');
        this.console.error(err);
        this.status = Status.ERROR;
    }

    deploy(outFilename: string) {
        this.console.log(`%c> ${outFilename}`, "color: #ff8080");
    }
}


export { Report, ReportSilent, ReportToConsole }