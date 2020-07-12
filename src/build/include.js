kremlin = {m: {}, loaded: {},
    require(k) {
        var l = this.loaded[k];
        if (l) return l.exports || {};
        else {
            console.log('%cimport', 'color: green', k);
            var mod = {exports: {}};
            this.loaded[k] = mod;
            this.m[k](mod, mod.exports);
            return mod.exports || {};
        }
    },
    export(m, d) {
        m.exports = Object.assign(m.exports || {}, d);
    },
    node_require(nm) {
        var m = require(nm);
        kremlin.loaded[`node://${nm}`] = {exports: m};
        return m;
    },
    node_startup(deps) {
        for (let m of deps) this.node_require(m);
    }
};

// @todo based on actual deps
kremlin.node_startup(['path', 'fs', 'zlib', 'console', 'assert', 'events', 'stream', 'util']);
