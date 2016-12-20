try {
var gui = require('nw.gui');
try {
  win = gui.Window.get();
  var nativeMenuBar = new gui.Menu({ type: "menubar" });
  nativeMenuBar.createMacBuiltin("Web.RealTime");
  win.menu = nativeMenuBar;
} catch (ex) {
  console.log(ex.message);
}
} catch (ex) { /* guess we're not running inside nwjs */ }


var fs = require('fs')
  , child_process = require('child_process')
  , path = require('path')

var mode, here, there, projdir;

if (typeof window == 'undefined') {
    mode = 'cli';

    require('LiveScript');

    here = path.dirname(process.argv[1]);  //  module.filename doe *not* work because it will expand symlinks
    projdir = process.cwd();

    there = path.relative(projdir, here) || ".";

    framework = {require: require};
    console.group = console.groupEnd = console.log;
}
else {
    mode = 'nw';
    framework = {require: global.require};
    /* require() works in mysterious ways */
    /* TODO see if we can do this better with global.module.filename or global.module.paths */
    pathname = path.join(window.location.protocol == 'file:' ? '' : global.__dirname, window.location.pathname)
    projdir = fs.realpathSync(path.dirname(pathname));
    var thisScript = path.basename(document.currentScript.attributes.src.value)
    var thisScriptPath = path.join(projdir, document.currentScript.attributes.src.value)
    here = '.'
    var depth = 5;
    for (var i = 0; i < depth; i++) {
      try { framework.require.resolve(path.join(here, thisScript)); break; }
      catch (e) { here = path.join(here, '..'); }
    }
    if (i >= depth) here = path.dirname(thisScriptPath);
    /*var there = path.dirname(pathname)
    for (var i = 0; i < depth; i++) {
      if (fs.existsSync(path.join(there, thisScript))) break;
      else there = path.dirname(there);
    }
    if (i >= depth)*/ there = path.dirname(thisScriptPath);
    there = (path.relative(process.cwd(), there)) || ".";
    /* in case we are running inside Electron (this is dangerous) */
    delete module;
}

framework.require.extensions['.ls.js'] = framework.require.extensions['.js'];
framework.require.extensions['.coffee.js'] = framework.require.extensions['.js'];

var render = require(here+'/src/render');

Reload = {
  framework: framework,
  cd: function(projdirChange) {
    if (this.watcher) console.warn("Reload: too late to change directory (watcher already started)");
    projdir = path.isAbsolute(projdirChange) ? projdirChange 
      : path.join(projdir, projdirChange);
    fs.lstat(projdir, function(error, stat) {
      if (error) console.warn(`Reload: projdir='${projdir}': ${error.message}`)
      else if (!stat.isDirectory) console.warn(`Reload: projdir='${projdir}': not a directory`)
    });
  },
  _ignored: function(filename) { 
    return !(this._ignoreFuncs.every(function(f) { 
      try { return !f(filename); } catch(e) { console.error(e); } 
    }));
  },
  _ignoreFuncs: [function(filename) { return filename.split(path.sep).some(
                   function(x) { return x[0] == '.' || x == 'node_modules' }) }],
  ignore: function(/*filters...*/) {
    function ignore(filt) {
      if (filt instanceof RegExp) f = function(filename) { return filename.match(filt); };
      else if (filt.call) f = filt;
      else {
        console.error("Reload: invalid filter; must be a function or RegExp.");
        return ;
      }
      this._ignoreFuncs.push(f);
    }
    for (var i = 0; i < arguments.length; i++)
      ignore.call(this, arguments[i]);
  }
}


function _rebuildAndReload() {
  console.group("rebuild " + projdir);
  var nerrors = 0
  var compile = render.compile({projdir: projdir, there: there, framework: framework});
  try {
    for (k in compile)
      try { compile[k]() }
      catch(e) { nerrors++; console.error("Error in builder '" + k + "': " + e.stack); }
  
    var success = (nerrors == 0)
    if (success) _reload();
    else console.error("build failed.");
    return success;
  }
  finally { console.groupEnd(); }
}

function _reload() {
  if (mode == 'nw') {
    if (window.onbeforeunload) window.onbeforeunload();
    window.location.reload();
  }
}
  
function _makeWatcher() {
  var watcher = fs.watch(projdir, {persistent: false, recursive: true}, function (event, filename) {
    if (filename && Reload._ignored(filename)) return ;
    console.log(filename);
    process.stdout.write(filename);
    watcher.close();
    if (!_rebuildAndReload()) {
      setTimeout(function() {
        watcher = _makeWatcher(); // restart watcher - notice that this does not update Reload.watcher
      }, 200);
    }
  });
  window.addEventListener('unload', function() { watcher.close(); })
  return watcher;
}

if (mode == 'nw') {
  /* wait for document to become ready before installing the watcher
   * to give the page a chance to call Reload.cd() or do other
   * configuration. */
  document.onreadystatechange = function () {
    if (document.readyState == "interactive") {
      setTimeout(function() {
        Reload.watcher = _makeWatcher();  // attach to Reload: for debugging only
      }, 200);
    }
  };
}

if (mode == 'cli') {
  console.log("projdir=" + projdir);
  console.log("here=" + here);
  console.log("there=" + there);
  _rebuildAndReload();
}
