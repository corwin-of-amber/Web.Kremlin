kremlin = {m: {}, loaded: {},
    require(k, isDefault) {
        var l = this.loaded[k];
        if (l) return l.exports || {};
        else {
            console.log('%cimport', 'color: green', k);
            var mod = {exports: {}};
            this.loaded[k] = mod;
            var fun = this.m[k];
            if (fun) fun(mod, mod.exports);
            else throw new Error('module not found: ' + k);
            var res = mod.exports || {};
            if (isDefault && res.default) res = res.default;
            return res;
        }
    },
    requires(ks) {
        if (ks.length === 0) return {};
        var c = this.require(ks[0]);
        for (let k of ks.slice(1))
            Object.assign(c, this.require(k));  // what if c is not an object?
        return c;
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
        kremlin.loaded[`node://${nm}`] = {exports: m};
        return m;
    },
    node_startup(deps) {
        if (typeof process === 'undefined') process = {env: {}, browser: true};
        if (typeof global === 'undefined') global = window;
        if (typeof require !== 'undefined')
            for (let m of deps) this.node_require(m);
    }
};

// @todo based on actual deps
kremlin.node_startup(['path', 'fs', 'zlib', 'console', 'assert', 'events', 'stream', 'util']);
