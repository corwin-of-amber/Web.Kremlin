from flask.helpers import make_response
import json



class Page(object):
    
    class Role:
        DATA = 0
        VIEW = 1
    
    def __init__(self, page_data, data_source_path=[], role=Role.VIEW):
        assert role in (self.Role.DATA, self.Role.VIEW)
        self.data = self._deref(page_data) if role == self.Role.VIEW else page_data
        self.data_source_path = data_source_path
    
    def _deref(self, obj):
        while isinstance(obj, (list, tuple)) and len(obj) == 1:
            obj = obj[0]
        return obj
    
    def _guess_contenttype(self):
        if isinstance(self.data, (str, unicode)):
            dsp = self.data_source_path
            if dsp and dsp[0] == 'views':
                return "text/html"
            return "text/plain"
        else:
            return "text/json"
        
    def _append_charset(self, contenttype):
        if contenttype in ["text/html", "text/plain"]: contenttype += "; charset=utf-8"
        return contenttype
        
    @property
    def contenttype(self):
        return self._append_charset(self._guess_contenttype())
    
    @property
    def text(self, as_contenttype=None):
        ct = as_contenttype or self._guess_contenttype()
        return (json.dumps(self.data) if ct == "text/json" else self.data)
        
    def render(self, as_contenttype=None):
        ct = as_contenttype or self._guess_contenttype()
        resp = make_response(self.text, 200)
        resp.headers['Content-type'] = self._append_charset(ct)
        return resp
