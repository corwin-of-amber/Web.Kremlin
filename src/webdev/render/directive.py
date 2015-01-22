'''
Created on Dec 5, 2014
'''

import re
from webdev.render.query import QueryContext, PipeQuery



class DirectiveTagSubst(object):
    
    def __init__(self):
        self.directives = {}
        self._tag_re = re.compile(r'<%-\s*(?P<directive>.*?)\s+(?P<args>.*?)[%/]>', re.UNICODE)
        
    def __call__(self, text_with_tags):
        return \
        self._tag_re.sub(lambda mo: self.interpret_directive(mo.group('directive').strip(), mo.group('args').strip()),
                         text_with_tags)
        
    def findall(self, text_with_tags):
        return [(mo.group('directive').strip(), mo.group('args').strip())
                for mo in self._tag_re.finditer(text_with_tags)]
        
    def interpret_directive(self, directive, argstring):
        try:
            cmd = self.directives[directive]
        except KeyError:
            cmd = self.default_command
        
        return cmd(directive, argstring)
    
    def default_command(self, directive, argstring):
        return "<!-- directive '%s' not recognized -->" % (directive,)
    
        

class DependenciesDirective(DirectiveTagSubst):
    
    def __init__(self, datastore=None, subquery_context=None, root_path="/app"):
        super(DependenciesDirective, self).__init__()
        self.datastore = datastore
        self.context = subquery_context
        self.root_path = root_path
        self.directives.update({'uses': self.make_tag,
                                'include': self.include})
        
    def make_tag(self, directive, argstring):
        return "<script src='%s'>" % (self.root_path + "/" + argstring)
    
    def include(self, directive, argstring):
        if self.context:
            ctx = self.context
        else:
            ctx = QueryContext()
            ctx.root = self.datastore
        return PipeQuery(argstring)(ctx).data
    
    def extract_dependencies(self, text_with_tags):
        print self.findall(text_with_tags)
        return [argstring for directive, argstring in self.findall(text_with_tags)
                if directive in ['include', 'uses']]
        
