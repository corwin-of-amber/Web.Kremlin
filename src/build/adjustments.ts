/**
 * These are used to tweak certain aspect of the compiled output.
 * For example, `DevAdjustments.Html` injects the Kremlin plug during
 * development, which supports auto rebuild and refresh.
 */

/**
 * Base class with empty implementations.
 */
class Adjustment {
    postprocess(text: string): string {
        return text;
    }
}


abstract class PostprocessMacros {
    abstract readonly _MACROS: [string, string][]

    postprocess(text: string): string {
        for (let [m, v] of this._MACROS)
            text = text.replace(m, v);
        return text;
    }
}


namespace DevAdjustments {

    export class Html extends PostprocessMacros {
        readonly _MACROS: [string, string][] = [
            ['<!-- @kremlin.plug -->',
             `<script>var k = kremlin.plug({window});</script>`]
        ];
    }

}

namespace ProdAdjustments {

    export class Html extends PostprocessMacros {
        readonly _MACROS: [string, string][] = [
            ['<!-- @kremlin.plug -->', '']
        ];
    }

}


export { Adjustment, PostprocessMacros, DevAdjustments, ProdAdjustments }