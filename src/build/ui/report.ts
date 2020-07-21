import { ModuleRef, SourceFile } from '../modules';


interface Report {
    visit(ref: ModuleRef): void
    deploy(outFilename: string): void
}


class ReportSilent implements Report {
    visit(ref: ModuleRef) { }
    deploy(outFilename: string) { }
}


class ReportToConsole implements Report {
    console: typeof console

    constructor(consol: typeof console) {
        this.console = consol;
    }

    visit(ref: ModuleRef) {
        if (ref instanceof SourceFile)
            console.log(`%cvisit ${ref.filename}`, 'color: #8080ff');
    }

    deploy(outFilename: string) {
        console.log(`%c> ${outFilename}`, "color: #ff8080");
    }
}


export { Report, ReportSilent, ReportToConsole }