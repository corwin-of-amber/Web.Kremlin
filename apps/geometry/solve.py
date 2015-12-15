import sys
from z3 import Solver, Real, sat, And
import json
import re

x = [Real('x.%d'%i) for i in xrange(6)]
d = Real('d')

s = Solver()
s.set(soft_timeout=1)

def _(varname):
  return Real(varname)

def avg(exprs):
  return reduce(lambda x,y: x + y, exprs) / len(exprs)

def sqdists(exprs, mean):
  return map(lambda x: (x-mean)**2, exprs)

def constraint(text):
  expr = re.sub(r'\[(.*?)\]', lambda mo: "_('%s')" % mo.groups(1), text)
  try:
    return eval(expr)
  except Exception, e:
    raise Exception("error in expr '%s': %s" % (text, e))
    
optional = []
    
def parse_line(line):
  line = line.strip()
  if line.startswith("? "):
    optional.append(constraint(line[2:].strip()))
  else:
    s.add(constraint(line))
  
for line in sys.stdin:
  try:
    parse_line(line)
  except Exception, e:
    print >> sys.stderr, e
  
r = s.check()
print r

def realval_to_float(x):
  if hasattr(x, 'approx'): x = x.approx()
  return x.numerator().as_long().__truediv__(x.denominator().as_long())

def gradually_enforce(s, constraints):
  m = None
  for c in constraints:
    s.add(c)
    if s.check() == sat:
      m = s.model()
    else:
      break
  return m

if r == sat:
  m = s.model()
  m = gradually_enforce(s, optional) or m
  j = {v.name(): realval_to_float(m.eval(v()))
       for v in m.decls()}
  print json.dumps(j)
else:
  print '{}'
