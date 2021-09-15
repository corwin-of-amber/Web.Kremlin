var kremlin = {m: {}, loaded: {}, debug: false,
    require(k, isDefault) {
        var mod = this.loaded[k];
        if (!mod) {
            if (this.debug) console.log('%cimport', 'color: green', k);
            mod = {exports: {}};
            this.loaded[k] = mod;
            var fun = this.m[k];
            if (fun) fun.call(mod.exports, mod, mod.exports, this.global);
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
    startup() {
        var glob = (typeof global !== 'undefined') ? global : null,
            win  = (typeof window !== 'undefined') ? window : null;
        this.global =  win || glob || {};
        if (typeof process === 'undefined')
            this.global.process = {env: {}, browser: true};
        else if (win) process.browser = true;  /* for NWjs */
        if (typeof require === 'undefined')
            this.global.require = nm => { console.warn(`require(${nm})`); return {}; }
        if (typeof __filename == 'undefined') this.global.__filename = '';
        if (typeof __dirname  == 'undefined') this.global.__dirname = '';
    },
    plug(proj) {
        return require('nwjs-kremlin').watch?.(proj);
    }
};

kremlin.startup();