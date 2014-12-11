
import re
import os.path
from flask.helpers import make_response



class UnderscoreTagSubst(object):
    
    def __init__(self):
        self.substitutions = {}
        self._tag_re = re.compile(r'<%=(?P<key>.*?)[%/]>', re.UNICODE)
        
    def __call__(self, text_with_tags):
        return \
        self._tag_re.sub(lambda mo: self.substitutions.get(mo.group('key').strip(), ''),
                         text_with_tags)
        
        
        
        
class PackageTagSubst(UnderscoreTagSubst):
    
    SCRIPTS = {'jquery': "/ext/jquery/.js",
               'livescript': ["/ext/livescript/.js", "/ext/livescript/prelude.js", "/ext/livescript/boilerplate.js"],
               'socket.io': "/ext/socket.io/.js",
               'codemirror': "/ext/codemirror/.js",
               'angularjs': "/ext/angularjs/.js",
               'underscore.js': "/ext/underscore.js/.js",
               'firebase': "https://cdn.firebase.com/js/client/1.1.1/firebase.js",
               'angularjs.angularfire': "https://cdn.firebase.com/libs/angularfire/0.8.2/angularfire.js",
               'katex': ["/ext/katex/.css", "/ext/katex/.js", "/ext/katex/boilerplate.js"],
               'mathjax': ["/ext/mathjax/MathJax.js", "/loc/mathjax/boilerplate.js"],
               'dev.realtime': "/loc/dev.realtime/.js",
               }
        
    def __init__(self):
        super(PackageTagSubst, self).__init__()
        for k, v in self.SCRIPTS.iteritems():
            self.substitutions[k] = self._mktag(v)
            
    def _mktag(self, uri):
        if isinstance(uri, (list, tuple)):
            return "".join(self._mktag(u) for u in uri)
        elif isinstance(uri, str):
            if uri.endswith(".css"):
                return '<link rel="stylesheet" type="text/css" href="%s">' % uri
            else:
                return '<script src="%s"></script>' % uri
        else:
            raise TypeError, "invalid script '%s'" % (uri,)
            


class ServePackages(object):
    """
    Maintains a repository of installed client-side packages (Javascript, CSS, etc.)
    and generates response to clients requesting to access those packages.
    Requests can be generated easily by adding <%= package /> tags to the HTML source,
    which are pre-processed by PackageTagSubsts.
    """

    INSTALLED_PACKAGES = {'jquery':      {'path': "js/lib/jquery",
                                          'aliases': {'.js': "jquery-1.11.1.min.js"}},
                          'livescript':  {'path': ["js/lib/livescript", "js/patch/livescript"],
                                          'aliases': {'.js': "livescript.js", 'prelude.js': "prelude-browser-min.js"}},
                          'socket.io':   {'path': "js/lib/socket.io",
                                          'aliases': {'.js': "socket.io-0.9.16.min.js"}},  # 1.0.x currently does not play well with Flask-SocketIO
                          'codemirror':  {'path': "js/lib/codemirror",
                                          'aliases': {'.js': "lib/codemirror.js", '.css': "lib/codemirror.css"}},
                          'angularjs':   {'path': "js/lib/angularjs",
                                          'aliases': {'.js': "angular.js"}},
                          'underscore.js': {'path': "js/lib/underscore.js",
                                            'aliases': {'.js': "underscore-min.js"}},
                          'katex':       {'path': ["js/lib/katex", "js/patch/katex"],
                                          'aliases': {'.js': "katex.min.js", '.css': "katex.min.css"}},
                          'mathjax':     {'path': ["js/lib/mathjax", "js/patch/mathjax"],
                                          'aliases': {'.js': "MathJax.js"}},
                          'dev.realtime':{'path': "js", 'aliases': {'.js': "dev.realtime.js"}}
                          }
    
    CONTENTTYPE_BY_EXT =  {'.js': 'text/javascript', 
                           '.woff2': 'application/font-woff',
                           '.htm': 'text/html'}
    
    def __init__(self, root_path="."):
        self.root_path = root_path
        self.tags = PackageTagSubst()
        for name, pkg in self.INSTALLED_PACKAGES.iteritems():
            pkg['__name__'] = name 
        
    def find_resource(self, package_or_path, resource):
        path = package_or_path['path'] \
               if isinstance(package_or_path, dict) else package_or_path
        if isinstance(path, (str, unicode)): path = [path]
        for path_el in path:
            fullpath = os.path.join(self.root_path, path_el, resource)
            if os.path.isfile(fullpath):
                return fullpath
        else:
            raise IOError, "Resource not found: '%s' in %s" % (resource, path)
        
    def serve(self, package_name_or_config, resource):
        if isinstance(package_name_or_config, (str, unicode)):
            try:
                package_config = self.INSTALLED_PACKAGES[package_name_or_config]
            except KeyError:
                return "Package not found: '%s'" % package_name_or_config, 404
        else:
            package_config = package_name_or_config  # TODO
        resource = package_config['aliases'].get(resource, resource)
        try:
            resp = make_response(open(self.find_resource(package_config, resource)).read(), 200)
            resp.headers['Content-Type'] = self.resource_contenttype(resource)
            return resp
        except IOError:
            return "Resource not found: '%s / %s'" % (package_config['__name__'], resource), 404
    
    def resource_contenttype(self, resource_path):
        _, ext = os.path.splitext(resource_path)
        return self.CONTENTTYPE_BY_EXT.get(ext, "text/"+ext.replace(".",""))
