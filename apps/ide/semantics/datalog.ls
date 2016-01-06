Fiber = require \fibers
{zip, minimum-by, partition, concat, concat-map} = require 'prelude-ls'


  
class TupleStore

  ->
    @tuples = []
    
  add: (tuple) ->
    if !@has tuple
      @tuples.push tuple
    
  add-all: (tuples) ->
    tuples.for-each @~add
    
  has: (tuple) ->
    @tuples.some (=== tuple)
    
  rev:~
    -> @tuples.length
    
  query: (patterns, valuation ? new Valuation) ->
    if typeof patterns == 'string'
      @query @parse-tuples(patterns), valuation
    else if patterns.length == 0
      [[valuation]]
    else
      atom = patterns[0]
      mo = @find-all valuation.mask atom .tuples
      rows = mo.map ~>
        v = valuation.clone!unify atom, it
        [[it, ...x] for x in @query patterns[1 to], v]
      [].concat ...rows
    
  query-v: (patterns, valuation ? new Valuation) ->
    @query patterns, valuation .map -> it[*-1].values
    
  find-all: (pattern) ->
    new TupleStore
      ..tuples = [t for t in @tuples 
                  when @matches pattern, t]

  @matches = (pattern, tuple) ->
    pattern.length == tuple.length && \
    zip pattern, tuple .every ->
      (it.0 is undefined) || (it.0 === it.1)
      
  matches: @matches
    
  toString: ->
    JSON.stringify @tuples
      
  # -----------
  # Parser part
  # -----------
  
  parse-tuples: (text) ->
    strings = []
    text = text.replace /"(.*?)"/g, (matched, group) ->
      i = strings.length
      strings.push group
      '"' + i
    atoms = text.split /[,&]/
    for atom in atoms
      atom.trim!split /\s+/ .filter (!= '') .map ~>
        @parse-literal it, strings
        
  parse-literal: (text, strings={}) ->
    if text == /^\d+$/
      parseInt text
    else if (mo = (text == /^"(\d+)$/))?
      strings[parseInt mo.1]
    else
      text

      
class Valuation

  (@values ? {}) ->
    
  @is-var = (x) -> typeof x == "string" && x is /_$/
    
  is-var: @is-var
    
  mask: (pattern) ->
    pattern.map ~> if @is-var it then @values[it] else it
    
  unify: (pattern, tuple) ->
    # assumes TupleStore.matches @mask(pattern), tuple
    zip pattern, tuple .forEach ~>
      if @is-var it.0 and it.0 != '_'
        @values[it.0] = it.1
    @
  
  get: -> @values[it]
  
  interpolate: (str) ->
    str.replace /\[(.*?_)\]/g, (matched, group) ~>
      if (val = @get(group))
        "[#val]"
      else matched
  
  clone: -> new Valuation({} <<< @values)
    


class Datalog
  (@db, @rules=[]) ->

  digest: ->
    rev = 0
    while rev != @db.rev
      rev = @db.rev
      @rules.for-each @~process
    
  parse-rules: (text) ->
    text.split /\n(?=\S)/ .map ~>
      lines = it.split /\n/ .filter (!= /^\s*$/)
      lhs: lines.filter (!= /^\s/) |> concat-map @db~parse-tuples
      rhs: lines.filter (== /^\s/) |> concat-map @db~parse-tuples
    
  process: (rule) ->
    if rule.map?
      rule.map @~process
    else
      db = @db
      db.query rule.lhs .map ->
        v = it[*-1]
        for atom in rule.rhs .map v~mask
          if atom[0] == "emit"
            db.add [atom[0], v.interpolate atom[1]]
          else
            db.add v.mask atom
    
      
db = new TupleStore

@ <<< {TupleStore, Datalog, Valuation}
