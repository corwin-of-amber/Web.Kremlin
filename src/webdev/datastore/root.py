import sqlite3
from collections import namedtuple


class DataStoreRoot(object):
    
    class Schema(object):
        Field = namedtuple("Field", "name type")
        def __init__(self):
            self.tables = {}
    
    def __init__(self, db_filename):
        self.db = sqlite3.connect(db_filename)
        self.schema = self._read_schema()
        
    def get(self, path):
        if not path:
            return [(tablename,) + row
                    for tablename in self.schema.tables
                    for row in self.get([tablename])]
        else:
            return self.SubTable(self, path).get()
    
    def put(self, path, new_value):
        if not isinstance(new_value, (list, tuple)):
            self.put_row(path, [new_value])
        else:
            if new_value and not isinstance(new_value[0], (list, tuple)):
                new_value = [new_value]
            self.put_many(path, new_value)
    
    def put_row(self, path, new_value):
        if not path:
            raise NotImplementedError
        else:
            self.SubTable(self, path).put(new_value)
    
    def put_many(self, path, new_values):
        if not path:
            raise NotImplementedError
        else:
            self.SubTable(self, path).put_many(new_values)
    
    class SubTable(object):
        
        def __init__(self, owner, path):
            self.o = owner
            if not path: raise ValueError, "empty path"
            self.tablename = path[0]
            try:
                fieldnames = [fld.name for fld in self.o.schema.tables[self.tablename]]
            except KeyError:
                raise KeyError, "no such table: '%s'" % self.tablename
            self.where_field_values = path[1:]
            if len(fieldnames) < len(self.where_field_values):
                raise ValueError, "not enough fields in table '%s' (expected at least %d)" % (self.tablename, len(self.where_field_values))
            self.where_fields = fieldnames[:len(self.where_field_values)]
            self.set_fields = fieldnames[len(self.where_fields):]
            self.where_clause = " AND ".join("([%s]=?)" % fn for fn in self.where_fields) or "1=1"
            self.set_clause = ",".join("[%s]=?" % fn for fn in self.set_fields)

        def get(self):
            dataset = self.o.db.execute("SELECT * FROM [%s]" % self.tablename).fetchall()
            for ap in self.where_field_values:
                dataset = [row[1:] for row in dataset if row and self._match(ap, row[0])]
            return dataset

        def put(self, new_value):
            new_value = self._pad(new_value)
            if self._update(new_value) == 0:
                self._insert(new_value)

        def put_many(self, new_values):
            self.clear()
            for new_value in new_values: self._insert(self._pad(new_value))   # naive

        def _update(self, new_value):
            return \
                self.o.db.execute("UPDATE [%s] SET %s WHERE %s" % (self.tablename, self.set_clause, self.where_clause),
                                (list(new_value) + list(self.where_field_values))).rowcount

        def _insert(self, new_value):
            insert_values = list(self.where_field_values) + list(new_value)
            insert_term = ",".join(["?" for _ in insert_values])
            self.o.db.execute("INSERT INTO [%s] VALUES (%s)" % (self.tablename, insert_term), insert_values)
            
        def _pad(self, new_value):
            if len(self.set_fields) < len(new_value):
                raise ValueError, "not enough fields in table '%s' (expected at least %d)" % (self.tablename, len(self.where_fields) + len(self.set_fields))
            if len(new_value) < len(self.set_fields):
                new_value = list(new_value) + [None] * (len(self.set_fields) - len(new_value))
            return new_value
            
        def clear(self):
            self.o.db.execute("DELETE FROM [%s] WHERE %s" % (self.tablename, self.where_clause), self.where_field_values)

        def _match(self, path_query_pattern, value):
            return path_query_pattern == value
                
            
    
    def transaction(self):
        class Transaction(object):
            def __init__(self, db): self.db = db
            def __enter__(self): pass
            def __exit__(self, error_type, value, traceback):
                if error_type is None: self.db.commit()
        return Transaction(self.db)
    
    def _read_schema(self):
        s = self.Schema()
        table_names = [name for (name,) in
                       self.db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        for table_name in table_names:
            fields = [self.Schema.Field(field_name, field_type) for _, field_name, field_type, _, _, _ in
                      self.db.execute("PRAGMA table_info([%s])" % table_name).fetchall()]
            s.tables[table_name] = fields
        return s
    


if __name__ == '__main__':
    import shutil
    shutil.copy("../../../web/app.db", "/tmp/_test.db")
    dsr = DataStoreRoot("/tmp/_test.db")
    print dsr.schema.tables
    print dsr.get([])
    print dsr.get(['views'])
    print dsr.get(['views', 'index'])
    with dsr.transaction():
        dsr.put(['views', 'index'], ['unwelcome'])
    print dsr.get(['views', 'index'])
    with dsr.transaction():
        dsr.put(['views', 'point'], ['made'])
    print dsr.get(['views'])
