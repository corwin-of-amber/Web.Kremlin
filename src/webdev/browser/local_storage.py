
import os.path
import glob
import sqlite3
from fnmatch import fnmatch



class SafariLocalStoragePull(object):
    
    SAFARI_PATH = "~/Library/Safari/LocalStorage"
    
    def __init__(self):
        self.safari = os.path.expanduser(self.SAFARI_PATH)
        self.dbs = []
        
    def open_db(self, db_glob):
        filenames = glob.glob(os.path.join(self.safari, db_glob))
        self.dbs += [sqlite3.connect(fn) for fn in filenames]
        
    def __getitem__(self, key):
        for d in self.dbs:
            try:
                return self._getitem(d, key)
            except IndexError:
                continue
        raise KeyError, "Local storage does not contain '%s'" % (key,)
    
    def get(self, key, default_value=None):
        try:
            return self[key]
        except KeyError:
            return default_value
        
    def pullover(self, key_glob):
        mp = {key: self._getitem(d, key) 
              for d in self.dbs for key in self._getkeys(d)
                if fnmatch(key, key_glob)}
        return mp
        
    def _getkeys(self, d):
        c = d.cursor()
        c.execute("SELECT key FROM ItemTable")
        return [x for x, in c.fetchall()]
    
    def _getitem(self, d, key):
        c = d.cursor()
        c.execute("SELECT value FROM ItemTable WHERE key=?", (key,))
        return unicode(c.fetchone()[0], 'utf-16')
    
    
        