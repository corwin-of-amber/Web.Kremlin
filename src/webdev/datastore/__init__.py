

class TextContent(unicode):
    
    def with_type(self, text_content_subtype="plain"):
        self.content_subtype = text_content_subtype
        return self
