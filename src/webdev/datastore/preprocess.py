'''
Provides a mechanism to define 'filters' then run on data before
it is sent to the client.

This can be done at the time of request, when data is stored and
modified, or lazily cached.
(currently I'm only implementing ad-hoc application)

Created on Dec 10, 2014
'''



class PreprocessingCore(object):
    
    DEFAULT_FILTERS = {}

    class ToolError(Exception): pass
    
    def __init__(self):
        self.filter_procedures = {}
        
    def __call__(self, original_data, contenttype="text/html"):
        if isinstance(original_data, (str, unicode)) and \
           original_data.startswith("#!"):
            shab, script = original_data.split('\n', 1)
            cmd, args = shab[2:].strip().split(" ", 1)
            return self.apply_filter(script, cmd, args)
        else:
            return original_data  # nothing to do            
        
    def apply_filter(self, original_data, filter_name, args, contenttype="text/html"):
        try:
            proc = self.filter_procedures[filter_name]
        except KeyError:
            return self._fmt_error("filter not found: '%s'" % (filter_name,), contenttype)
        
        try:
            return proc(original_data, args, contenttype=contenttype)
        except self.ToolError, e:
            return self._fmt_error("error in filter '%s':\n" % (filter_name,) + unicode(e), contenttype)
        
    def _fmt_error(self, error, contenttype):
        if contenttype == "text/html":
            return u"<pre> %s </pre>" % (error,)
        else:
            return u"/*-- %s --*/" % (error,)  # safe guess?
        
    @classmethod
    def configure(cls):
        p = cls()
        p.filter_procedures.update(
            {k: v() for k,v in cls.DEFAULT_FILTERS.iteritems()})
        return p


class JisonPreprocess(object):
    
    def __call__(self, grammar_text, args, contenttype):
        from gevent import subprocess
        p = subprocess.Popen("/opt/local/bin/jison", 
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # @UndefinedVariable
        out, err = p.communicate(grammar_text)
        if p.returncode:
            raise PreprocessingCore.ToolError(err)
        
        if contenttype == "text/html":
            return "<script>%s</script>" % out
        else:
            return out


class NearleyPreprocess(object):
    
    def splitargs(self, args):
        import shlex
        if isinstance(args, unicode):
            args = args.encode("utf-8")
        return shlex.split(args)
    
    def __call__(self, grammar_text, args, contenttype):
        from gevent import subprocess
        p = subprocess.Popen(["/opt/local/bin/nearleyc"] + self.splitargs(args),
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # @UndefinedVariable
        out, err = p.communicate(grammar_text)
        if p.returncode:
            raise PreprocessingCore.ToolError(err)
        
        if contenttype == "text/html":
            return "<script>%s</script>" % out
        else:
            return out



#
# Default configuration for PreprocessingCore
#
PreprocessingCore.DEFAULT_FILTERS.update({
    'jison': JisonPreprocess,
    'nearley': NearleyPreprocess
    })



if __name__ == '__main__':
    print JisonPreprocess()("%lex\n%%\n. return 0\n/lex\n%start e \n%% e : ;", "text/html")
    