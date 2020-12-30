var kremlin = {m: {}, loaded: {}, debug: false,
    require(k, isDefault) {
        var mod = this.loaded[k];
        if (!mod) {
            if (this.debug) console.log('%cimport', 'color: green', k);
            mod = {exports: {}};
            this.loaded[k] = mod;
            var fun = this.m[k];
            if (fun) fun(mod, mod.exports);
            else throw new Error('module not found: ' + k);
        }
        var res = mod.hasOwnProperty('exports') ? mod.exports : {};
        if (isDefault && res.default) res = res.default;
        return res;
    },
    requires(ks) {
        if (ks.length === 0) return {};
        var c = this.require(ks[0]);
        for (let k of ks.slice(1))
            Object.assign(c, this.require(k));  // what if c is not an object?
        return c;
    },
    async import(k, isDefault) {
        return this.require(k, isDefault);
    },
    export(m, d, names) {
        m.exports = m.exports || {};
        if (names)
            for (let nm of names) m.exports[nm] = d[nm]
        else
            m.exports = Object.assign(m.exports, d);
    },
    node_require(nm) {
        var m = require(nm);
        this.loaded[`node://${nm}`] = {exports: m};
        return m;
    },
    node_startup(deps) {
        var glob;
        if (typeof global === 'undefined') {
            if (typeof window !== 'undefined') glob = window;
        }
        else glob = global;
        if (typeof process === 'undefined') glob.process = {env: {}, browser: true};
        if (typeof require !== 'undefined')
            for (let m of deps) this.node_require(m);
    }
};

kremlin.node_startup([] /** @todo probably deps are not needed anymore? */);

var __filename = '';