var kremlin = {m: {}, loaded: {}, debug: false,
    require(k, isDefault) {
        var mod = this.loaded[k];
        if (!mod) {
            if (this.debug) console.log('%cimport', 'color: green', k);
            mod = {exports: {}};
            this.loaded[k] = mod;
            var fun = this.m[k];
            if (fun) fun.call(mod.exports, mod, mod.exports, this.global);
            else if (k.endsWith('.css')) return {}; /** @oops */
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
    require_node(nm) { // (stub) replaced during `startup` as is appropriate
        console.warn(`require(${nm})`);
        return {};
    },
    async import(k, isDefault) {
        return this.require(k, isDefault);
    },
    export(m, d, names) {
        m.exports = m.exports || {};
        if (names)
            for (let nm of names)
                if (Array.isArray(nm)) m.exports[nm[0]] = d[nm[1]]
                else                   m.exports[nm] = d[nm]
        else
            m.exports = Object.assign(m.exports, d);
    },
    startup(ctx) {
        var glob = (typeof global !== 'undefined') ? global : null,
            win  = (typeof window !== 'undefined') ? window : null;
        this.global =  win || glob || ctx || {};
        if (typeof process === 'undefined')
            this.global.process = {env: {}, browser: true};
        else if (win) process.browser = true;  /* for NWjs */
        if (typeof require === 'undefined')
             this.global.require = this.require_node;
        else
            this.require_node = require;
        if (typeof __filename == 'undefined') this.global.__filename = '';
        if (typeof __dirname  == 'undefined') this.global.__dirname = '';
        this.meta = {
            url: typeof __dirname == 'undefined' ? '' 
                  : `file://${__dirname}/${__filename ?? ''}`
        };
    },
    main(entry, globals = {}) {
        Object.assign(this.global, globals);
        if (!Array.isArray(entry)) entry = [entry];
        return this.requires(entry);
    },
    plug(proj) {
        return require('nwjs-kremlin').watch?.(proj);
    }
};

kremlin.startup(this);