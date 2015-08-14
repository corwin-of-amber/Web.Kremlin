this.PACKAGES = {
  'jquery':      {'path': ["lib/jquery"],
                  'tags': {'': ["jquery-1.11.1.min.js"],
                           'ui': ["jquery-ui-1.11.4/jquery-ui.js", "jquery-ui-1.11.4/jquery-ui.css"]}},
  'angular':     {'path': ["lib/angularjs"],
                  'tags': {'': ["angular.js"], 'recursion': ["addons/angular-recursion.js"]}},
  'livescript':  {'path': ["lib/livescript", "patch/livescript"],
                  'tags': {'': ["livescript.js", "boilerplate.js"],
                           'prelude': ["prelude-browser-min.js"]}},
  'socket.io':   {'path': "lib/socket.io",
                  'aliases': {'.js': "socket.io-0.9.16.min.js"}},  // 1.0.x currently does not play well with Flask-SocketIO
  'codemirror':  {'path': ["lib/codemirror"],
                  'tags': {'': ["lib/codemirror.js", "lib/codemirror.css"]}},
  'underscore':  {'path': ["lib/underscore.js"],
                  'tags': {'js': ["underscore-min.js"]}},
  'katex':       {'path': ["lib/katex", "patch/katex"],
                  'aliases': {'.js': "katex.min.js", '.css': "katex.min.css"}},
  'mathjax':     {'path': ["lib/mathjax", "patch/mathjax"],
                  'aliases': {'.js': "MathJax.js"}},
  'handsontable':{'path': ["lib/handsontable"],
                  'aliases': {'.js': "handsontable.full.js", '.css': "handsontable.full.css"}},
  'jstree':      {'path': ["lib/jstree"],
                  'tags': {'': ["themes/default/style.min.css", "jstree.js"]}},
  'nearley':     {'path': ["lib/nearley"],
                  'aliases': {'.js': 'nearley.js'}},
  'meteor':      {'path': ["packages"],
                  'tags': {'': ["underscore.js", "meteor.js", "json.js", "base64.js", "ejson.js", "id-map.js", "ordered-dict.js", "tracker.js", "random.js", "geojson-utils.js", 
                                "minimongo.js", "logging.js", "retry.js", "check.js", "ddp.js", "mongo.js",
                                "deps.js", "reactive-dict.js", "session.js", "livedata.js"]}},
  'ckeditor':    {'path': ["lib/ckeditor/4.5b"],
                  'tags': {'': ["ckeditor.js"]}},
  'relsheets':   {'path': ["lib/relsheets"],
	              'tags': {'': ["lib/meta/exported.coffee.js", "lib/util.coffee.js", "lib/controlcontext.coffee.js", "common.coffee.js", "data.coffee.js", "view.coffee.js", "lib/boilerplate.coffee.js"],
	                       'dev': ["formula/compiler.coffee.js", "formula/formulas.coffee.js", "formula/language.jison.js"]}}
};

