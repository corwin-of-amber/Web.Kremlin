

class DatalogBridge
  (@dl, @unify) -> @db = @dl.db

  term-to-atom: (id) -> 
    if ! id.is-leaf then throw new Error "I am stupid"
    if id.root.kind == 'variable' then "$#{id.root.literal}" else id.root.literal
  atom-to-term: (s) -> if (mo = s is /^\$(.*)/) then TV(mo.1) else TI(s)
  
  subst-atom: (atom) -> @term-to-atom @unify.normalize-var @atom-to-term(atom)
  subst-in-tuples: (tuples) ->
    for tuple in tuples
      tuple.map @~subst-atom

  add: (tuple) ->
    @db.add-all @gen-tuples [tuple]
    
  add-all: (tuples) ->
    @db.add-all @gen-tuples tuples
      
  gen-tuples: (tuples-with-terms) ->
    []
      for tup in tuples-with-terms
        if tup.0 == 'unify'
          if tup.1.is-leaf! && tup.2.subtrees.every (.is-leaf!)
            ..push ['=', ...(tup[1 to] ++ tup[2].subtrees).map @~term-to-atom]
        else if tup.0 == '.' || tup.0 == '.[]'
          if tup[1 to].every (.is-leaf!)
            ..push [tup.0, ... tup[1 to].map @~term-to-atom]
        else
          ...
  gen-eqs: ->
    vars = @unify.assn-vars!map T(_)
    for v in vars when !(t = @unify.normalize v).is-leaf!
      if t.subtrees.every (.is-leaf!)
        ["=", @term-to-atom(v), @term-to-atom(t), ...t.subtrees.map @~term-to-atom]
    # TODO deeper trees
  
  is-trivial: (tup) ->
    tup.length == 3 && (tup.0 == "=" || tup.0 == "unify") && 
      tup.1 == tup.2
  
  digest: ->
    rev = @unify.rev

    loop
      @dl.digest!
      eqs = @db.tuples.filter -> it.0 == "=" || it.0 == "unify"
      eqs.for-each ~> @unify.unify @atom-to-term(it.1), @atom-to-term(it.2).of(...it[3 to].map @~atom-to-term)

      if rev > 100 then throw new Exception "fixpoint limit reached"

      if rev == @unify.rev then break
      else
        rev = @unify.rev
        @db.tuples = @subst-in-tuples @db.tuples .filter ~> !@is-trivial it
        @db.add-all @gen-eqs!


@ <<< {DatalogBridge}
