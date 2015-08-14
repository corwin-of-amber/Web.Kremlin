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
var here = '.'
for (var i = 0; i < 5; i++) {
  try { global.require.resolve(here + "/" + thisScript); break; }
  catch (e) { here = path.join(here, '..'); }
}
var there = path.dirname(window.location.pathname)
for (var i = 0; i < 5; i++) {
  if (fs.existsSync(path.join(there, thisScript))) break;
  else there = path.dirname(there);
}
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


function _rebuildAndReload() {
  console.group("rebuild " + projdir);
  var nerrors = 0
  try {
    for (k in render.compile)
      try { render.compile[k]() }
      catch(e) { nerrors++; console.error("Error in builder '" + k + "': " + e); }
  
    var success = (nerrors == 0)
    if (success) _reload();
    else console.error("build failed.");
    return success;
  }
  finally { console.groupEnd(); }
}

function _reload() {
  if (window.onbeforeunload) window.onbeforeunload();
  window.location = window.location;
}
  
function _makeWatcher() {
  return fs.watch(projdir, {persistent: false, recursive: true}, function (event, filename) {
    if (filename && filename[0] == '.') return ;
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
