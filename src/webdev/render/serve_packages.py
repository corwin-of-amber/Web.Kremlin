
import re
import os.path



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
               'livescript': "/ext/livescript/.js",
               'socket.io': "/ext/socket.io/.js",
               'codemirror': "/ext/codemirror/.js",
               'angularjs': "/ext/angularjs/.js",
               'underscore.js': "/ext/underscore.js/.js",
               'dev.realtime': "/loc/dev.realtime/.js",
               'firebase': "https://cdn.firebase.com/js/client/1.1.1/firebase.js",
               'angularjs.angularfire': "https://cdn.firebase.com/libs/angularfire/0.8.2/angularfire.js"}
    
    INSTALLED_PACKAGES = {'jquery':      {'path': "js/lib/jquery",
                                          'aliases': {'.js': "jquery-1.11.1.min.js"}},
                          'livescript':  {'path': "js/lib/livescript",
                                          'aliases': {'.js': "livescript.js"}},
                          'socket.io':   {'path': "js/lib/socket.io",
                                          'aliases': {'.js': "socket.io-0.9.16.min.js"}},  # 1.0.x currently does not play well with Flask-SocketIO
                          'codemirror':  {'path': "js/lib/codemirror",
                                          'aliases': {'.js': "lib/codemirror.js", '.css': "lib/codemirror.css"}},
                          'angularjs':   {'path': "js/lib/angularjs",
                                          'aliases': {'.js': "angular.js"}},
                          'underscore.js': {'path': "js/lib/underscore.js",
                                            'aliases': {'.js': "underscore-min.js"}},
                          'dev.realtime':{'path': "js", 'aliases': {'.js': "dev.realtime.js"}}
                          }
    
    CONTENTTYPE_BY_EXT =  {'.js': 'text/javascript', 
                           '.htm': 'text/html'}
    
    def __init__(self):
        super(PackageTagSubst, self).__init__()
        for k, v in self.SCRIPTS.iteritems():
            self.substitutions[k] = '<script src="%s"></script>' % v
            
    def resource_contenttype(self, resource_path):
        _, ext = os.path.splitext(resource_path)
        return self.CONTENTTYPE_BY_EXT.get(ext, "text/"+ext.replace(".",""))
