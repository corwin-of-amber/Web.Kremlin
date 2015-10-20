var gui = require('nw.gui');
win = gui.Window.get();
var nativeMenuBar = new gui.Menu({ type: "menubar" });
try {
  nativeMenuBar.createMacBuiltin("Web.RealTime");
  win.menu = nativeMenuBar;
} catch (ex) {
  console.log(ex.message);
}


global.require.extensions['.ls.js'] = global.require.extensions['.js']
global.require.extensions['.coffee.js'] = global.require.extensions['.js']

var fs = require('fs')
  , child_process = require('child_process')
  , path = require('path')

/* require() works in mysterious ways */
var projdir = fs.realpathSync(path.dirname(window.location.pathname));
var thisScript = path.basename(document.currentScript.attributes.src.value)
var thisScriptPath = path.join(projdir, document.currentScript.attributes.src.value)
var here = '.'
for (var i = 0; i < 5; i++) {
  try { global.require.resolve(path.join(here, thisScript)); break; }
  catch (e) { here = path.join(here, '..'); }
}
if (i >= 5) here = path.dirname(thisScriptPath);
var there = path.dirname(window.location.pathname)
for (var i = 0; i < 5; i++) {
  if (fs.existsSync(path.join(there, thisScript))) break;
  else there = path.dirname(there);
}
if (i >= 5) there = path.dirname(thisScriptPath);
there = (path.relative(process.cwd(), there)) || ".";

this.here = here
this.there = there
this.projdir = projdir

/*
console.log('cwd = ' + process.cwd());
console.log('path = ' + path.dirname(window.location.pathname));
console.log('here = ' + here);
console.log('there = ' + there);
*/

var render = require(here+'/src/render');

Reload = {
  _ignored: function(filename) { 
    return !(this._ignoreFuncs.every(function(f) { 
      try { return !f(filename); } catch(e) { console.error(e); } 
    }));
  },
  _ignoreFuncs: [function(filename) { return filename.split(path.sep).some(
                   function(x) { return x[0] == '.' || x == 'node_modules' }) }],
  ignore: function(filt) {
    if (filt instanceof RegExp) f = function(filename) { return filename.match(filt); };
    else if (filt.call) f = filt;
    else {
      console.error("Reload: invalid filter; must be a function or RegExp.");
      return ;
    }
    this._ignoreFuncs.push(f);
  }
}


function _rebuildAndReload() {
  console.group("rebuild " + projdir);
  var nerrors = 0
  try {
    for (k in render.compile)
      try { render.compile[k]() }
      catch(e) { nerrors++; console.error("Error in builder '" + k + "': " + e.stack); }
  
    var success = (nerrors == 0)
    if (success) _reload();
    else console.error("build failed.");
    return success;
  }
  finally { console.groupEnd(); }
}

function _reload() {
  if (window.onbeforeunload) window.onbeforeunload();
  window.location.reload();
}
  
function _makeWatcher() {
  return fs.watch(projdir, {persistent: false, recursive: true}, function (event, filename) {
    console.log(filename);
    if (filename && Reload._ignored(filename)) return ;
    watcher.close();
    if (!_rebuildAndReload()) {
      setTimeout(function() {
        watcher = _makeWatcher(); // restart watcher
      }, 200);
    }
  });
}

var watcher = _makeWatcher();
window.addEventListener('unload', function() { watcher.close(); })
