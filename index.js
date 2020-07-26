
if (module.id == '.' && typeof nw !== 'undefined')
    nw.Window.open('build/kremlin/index.html', {}, function(win) {});
else
    module.exports = require('./build/kremlin/plug').default;