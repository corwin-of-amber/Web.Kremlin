class Tree
  (@root, @subtrees=[]) ->

  toString: ->
    if @subtrees.length == 0
      "#{@root}"
    else
      "#{@root}(#{@subtrees.join(', ')})"

  of: -> 
    new Tree(@root, @subtrees ++ &[to])
  
  is-leaf: -> @subtrees.length == 0
  
  equals: (other) ->
    @root.equals(other.root) &&
      @subtrees.length == other.subtrees.length &&
      zip(@subtrees, other.subtrees).every -> it.0.equals(it.1)

  nodes:~
    -> [@].concat ...@subtrees.map (.nodes)

  ## applies op to the root of each subtree
  map: (op) ->
    new Tree(op(@root), [s.map op for s in @subtrees])

  filter: (pred) ->
    if pred @root
      new Tree @root, ([s.filter pred for s in @subtrees].filter (x) -> x?)
    else null

  find: (value) ->
    @findT (n) -> n.root == value

  findT: (pred) ->
    if pred @ then @
    else
      for s in @subtrees
        if (n = s.findT(pred))? then return n

T = -> new Tree ...


@ <<< {Tree, T}
