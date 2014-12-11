'''
Provides a mechanism to define 'filters' then run on data before
it is sent to the client.

This can be done at the time of request, when data is stored and
modified, or lazily cached.
(currently I'm only implementing ad-hoc application)

Created on Dec 10, 2014
'''
from webdev.datastore import TextContent



class PreprocessingCore(object):
    
    DEFAULT_FILTERS = {}

    class ToolError(Exception): pass
    
    def __init__(self):
        self.filter_procedures = {}
        
    def apply_filter(self, original_data, filter_name, content_type="text/html"):
        try:
            proc = self.filter_procedures[filter_name]
        except KeyError:
            return self._fmt_error("filter not found: '%s'" % (filter_name,), content_type)
        
        try:
            return proc(original_data, content_type=content_type)
        except self.ToolError, e:
            return self._fmt_error("error in filter '%s':\n" % (filter_name,) + unicode(e), content_type)
        
    def _fmt_error(self, error, content_type):
        if content_type == "text/html":
            src = u"<!-- %s -->" % (error,)
        else:
            src = u"/*-- %s --*/" % (error,)  # safe guess?
        return TextContent(src).with_type("plain")
        
    @classmethod
    def configure(cls):
        p = cls()
        p.filter_procedures.update(
            {k: v() for k,v in cls.DEFAULT_FILTERS.iteritems()})
        return p


class JisonPreprocess(object):
    
    def __call__(self, grammar_text, content_type):
        from gevent import subprocess
        p = subprocess.Popen("server_side/jison_pipe", 
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # @UndefinedVariable
        out, err = p.communicate(grammar_text)
        if p.returncode:
            raise PreprocessingCore.ToolError(err)
        return out


#
# Default configuration for PreprocessingCore
#
PreprocessingCore.DEFAULT_FILTERS.update({
    'jison': JisonPreprocess
    })



if __name__ == '__main__':
    print JisonPreprocess()("%lex\n%%\n. return 0\n/lex\n%start e \n%% e : ;", "text/html")
    