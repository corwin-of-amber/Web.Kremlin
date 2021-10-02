
abstract class KeyedSet<E,K> implements Set<E> {
    _repr = new Set<K>()

    abstract realKey(e: E): K

    add(value: E): this { this._repr.add(this.realKey(value)); return this; }
    has(value: E) { return this._repr.has(this.realKey(value)); }
    clear(): void { this._repr.clear(); }
    delete(value: E): boolean { return this._repr.delete(this.realKey(value)); }
    get size() { return this._repr.size; }
    get [Symbol.toStringTag]() { return this._repr[Symbol.toStringTag]; }

    /* not implemented, sorry */
    forEach(callbackfn: (value: E, value2: E, set: Set<E>) => void, thisArg?: any): void { throw new Error('Method not implemented.'); }
    [Symbol.iterator](): IterableIterator<E> { throw new Error('Method not implemented.'); }
    entries(): IterableIterator<[E, E]> { throw new Error('Method not implemented.'); }
    keys(): IterableIterator<E> { throw new Error('Method not implemented.'); }
    values(): IterableIterator<E> { throw new Error('Method not implemented.'); }
}

class CaseInsensitiveSet extends KeyedSet<string, string> {
    realKey(e: string) { return e.toLowerCase(); }
}


export { KeyedSet, CaseInsensitiveSet }