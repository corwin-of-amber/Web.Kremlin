/**
 * Property decorator.
 * @from https://stackoverflow.com/a/61863345
 */

function nonenumerable(target: any, name: string): void;
function nonenumerable(target: any, name: string, desc: PropertyDescriptor): PropertyDescriptor;

function nonenumerable(target: any, name: string, desc?: any) {
    if(desc) {
        desc.enumerable = false;
        return desc;
    }
    Object.defineProperty(target, name,  {
        set(value) {
            Object.defineProperty(this, name, {
                value, writable: true, configurable: true,
            });
        },
        configurable: true,
    });
};


export default nonenumerable;