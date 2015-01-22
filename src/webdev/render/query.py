from webdev.render.page import Page
from pattern.mixins.attributes import WithMixIn


class PipeQuery(object):

    def __init__(self, query):
        self.query = self.parse(query)
        if self.query and self.query[-1] == ["!"]:
            self.query = self.query[:-1]
            self.force_singular = True
        else:
            self.force_singular = False
    
    @classmethod
    def parse(cls, text):
        if isinstance(text, (str, unicode)) and text.endswith("!"):
            return cls.parse(text[:-1]) + [["!"]]
        return [cls._split(path, "/") for path in cls._split(text, "|")]
            
    def __call__(self, ctx):
        """
        @param ctx: a QueryContext 
        """
        page = self.fetch_view(ctx)
        if len(self.query) > 1:
            assert len(self.query) == 2
            if isinstance(page.data, (str, unicode)):
                data_object = ctx.root.get(self.query[0])
                page.data = page.data + ctx.inject.epilog(data_object)
            else:
                raise ValueError, "page is not a view (%s)" % "/".join(page.data_source_path)
        if ctx.prep:
            page.data = ctx.prep(page.data, contenttype=page.contenttype) 
        if isinstance(page.data, (str, unicode)) and ctx.tags:
            page.data = ctx.tags(page.data)
        return page
    
    def fetch_view(self, ctx):
        page_data = ctx.root.get(self.query[-1])
        if self.force_singular:
            page_data = [x[0] for x in page_data]
            if page_data == []: page_data = ''
        page = Page(page_data, data_source_path=self.query[-1])
        return page
    
    def __eq__(self, other):
        tup = lambda o: (tuple(o.query), bool(o.force_singular))
        return tup(self) == tup(other)
            
    def __repr__(self):
        return " | ".join(" / ".join(path) for path in self.query) + (" !" if self.force_singular else "")
            
    @classmethod
    def _split(cls, text, sep):
        if isinstance(text, (str, unicode)):
            return [x.strip() for x in text.split(sep)]
        elif isinstance(text, (list, tuple)):
            return text
        else:
            raise TypeError, "unexpected: %s" % type(text).__name__
        


class QueryContext(WithMixIn):
    
    def __init__(self):
        """
        @param root: a DataStoreRoot
        @param inject: an InjectJsonToHtml
        @param tags: a PackageTagSubst
        """ 
        self.root = None
        self.prep = None
        self.inject = None
        self.tags = None
