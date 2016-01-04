{zip} = require 'prelude-ls'


class Unifier

  ->
    @assn = {}
    @rev = 0
    
  # x,y are Trees of Identifiers
  unify: (x, y) !->
    x = @expand-shallow x
    y = @expand-shallow y
    if @is-freevar(x)
      console.assert x.subtrees.length == 0
      if not x.equals(y)
        @assn[x.root.literal] = y
        @rev += 1
    else if @is-freevar(y)
      @unify y, x
    else 
      if (x.root.equals y.root) && x.subtrees.length == y.subtrees.length
        for [xs,ys] in zip x.subtrees, y.subtrees
          @unify xs, ys
      else
        throw new CannotUnify(x, y)
      
  is-freevar: (x) ->
    x.root.kind == 'variable' && !(x.root.literal of @assn)
    
  expand-shallow: (x) ->
    if x.root.kind == 'variable' && (v = @assn[x.root.literal])?
      @expand-shallow v
    else
      x

  assn-vars: ->
    [new Identifier(v, 'variable') for v of @assn]

  normalize: (x) ->
    x = @expand-shallow x
    new Tree(x.root, x.subtrees.map @~normalize)
  
  normalize-var: (v) ->
    if v.root.kind == 'variable' && (w = @assn[v.root.literal])? \
        && w.is-leaf!
      @normalize-var w
    else
      v


class CannotUnify
  (@x, @y) -> @message = "Cannot unify '#x' and '#y'"
  toString: -> @message


@ <<< {Unifier, CannotUnify}
