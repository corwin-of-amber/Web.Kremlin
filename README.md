# Kremlin
_A lean-and-mean Webpack alternative for development_

Kremlin is supposed to be a zero-config, easy to use webapp builder
and bundler for JavaScript and TypeScript.
It continues the tradition of Browserify, Webpack, RollupJS, and Parcel.
It strives to uphold the following ideals:
 * Require *no configuration at all* in almost all cases.
 * Provide *full transparency* of what is being bundled.
 * Generate code that is *easy to debug*.
 * Maintain a *clean, simple design* to allow users to tweak it.

Not all of the above has been achieved at this point. But it's good to have goals 😅

## Build

At the moment, there is no NPM package for Kremlin (although one is definitely planned).
To use Kremlin, you first have to clone the repo and build it:
```
% git clone https://github.com/corwin-of-amber/Web.Kremlin.git kremlin
% cd kremlin
% npm i
% npm run bootstrap
```

Needless to say, Kremlin is built with Kremlin. The `bootstrap` phase is used
to compile the TypeScript sources so that they can be run (with Node) in order
to build and bundle the base CLI.

After bootstrap, you can rebuild with `npm run build`. If you happen to break something, leading to Kremlin not being able to build itself anymore, you can always `npm run bootstrap` again.

To make the Kremlin CLI available for use in your project, it is recommended to link it globally:
```
% npm link
```

## Use

To build a project whose main file is HTML:
```
% kremlin index.html
```

That's it! Kremlin will crawl the dependencies and generate a development build in `build/kremlin`.
There are a few command-line options (try `kremlin --help`):
| Flag              | Description     |
|-------------------|-----------------|
| `-w` / `--watch`  | Keep running and recompile whenever files in the current directory change. |
| `-p` / `--prod`   | Generate a production build — force concatenation of all the `.js` files into a single bundle.  |
| `--node`          | Generate a bundle that runs in Node.js (only for a `.js` entry point).     |
