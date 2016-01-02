

class Identifier

  (@literal, @kind='?', @ns=undefined) ->

  toString: -> @literal.toString!

  equals: (other) -> 
    @literal === other.literal &&
    (@kind === '?' || other.kind === '?' || @kind === other.kind) &&
    @ns == other.ns


I = -> new Identifier ...
TI = -> new Tree(new Identifier ...)
TV = (v) -> new Tree(new Identifier v, 'variable')

@ <<< {Identifier, I, TI, TV}