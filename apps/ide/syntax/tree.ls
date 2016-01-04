{zip} = require 'prelude-ls'



class Tree

  (@root, @subtrees=[]) ->

  toString: ->
    if @subtrees.length == 0
      "#{@root}"
    else
      "#{@root}(#{@subtrees.join(', ')})"

  of: -> 
    new Tree(@root, @subtrees ++ arguments[to])
  
  is-leaf: -> @subtrees.length == 0
  
  equals: (other) ->
    @root.equals(other.root) &&
      @subtrees.length == other.subtrees.length &&
      zip(@subtrees, other.subtrees).every -> it.0.equals(it.1)


T = -> new Tree ...


@ <<< {Tree, T}