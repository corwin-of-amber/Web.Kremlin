LiveScript = require 'LiveScript'

{Block,Class,Fun,Var,Obj,Prop,Literal,Chain,
Index,Key,Assign,Arr,Parens,Call,Unary} = LiveScript.ast


class CompilationError
  (@err) ->


fresh = (name="T") -> TI("#{name}#{subscript-decimal fresh.cnt++}", 'variable')
fresh.cnt = 0

subscript-decimal = (index) -> 
  (for c in "#index" then subscript0_9[c]).join ''
subscript0_9 = "₀₁₂₃₄₅₆₇₈₉"


compile-typed-livescript = (program-text) ->
  try
    ast = LiveScript.ast program-text
  catch e
    throw new CompilationError(e)
  
  ß = new Unifier
  
  db = new TupleStore
  bridge = new DatalogBridge new Datalog(db), ß
  
  bridge.dl.process = ->
    Work.rest!
    Datalog::process.apply @, &
  
  bridge.dl.rules = bridge.dl.parse-rules """    
= t_ [] Array e_
  .[] t_ int e_ & . t_ length int

.[] cls_ idx_ typ1_ & .[] cls_ idx_ typ2_
  unify typ1_ typ2_
  
. cls_ mem_ typ1_ & . cls_ mem_ typ2_
  unify typ1_ typ2_
"""

  fresh.cnt = 0  # @@ just cause it's annoying

  global-scope = {name: "global", members: [], type: TI("<global>")}
  scopes = [global-scope]
  roots = []
  funcs = []
  marks = []
  
  if ast instanceof Block
    for e in ast.lines
      if e instanceof Class &&
         e.title instanceof Var
        clas = {name: e.title.value, members: []}
          scopes.push ..
        marks.push mark-for-node(e.title, {title: clas.name, className: "mark class"})
        global-scope.members.push {name: clas.name, type: TI("class"), scope: clas}
        #console.log e.title.value
        if e.fun.body instanceof Block
          for m in e.fun.body.lines
            if m instanceof Fun
              clas.members.push {name: "->"}
              #console.log "->"
              for member-name, member-node of collect-this m.params ++ [m.body]
                clas.members.push {name: member-name, type: type-of-node(member-node)}
                marks.push mark-for-node(member-node, {title: member-name, className: "mark variable"})
              fn-scope = {name: "->", type: fresh("S")}
              bridge.add ['.', fn-scope.type, TI("this"), TI(clas.name, 'class')]
              roots.push {nodes: m.params ++ [m.body], ctx: [fn-scope, global-scope]}
            else if m instanceof Obj
              for mem in m.items
                typ = type-of-node(mem.val)
                clas.members.push {name: mem.key.name, type: typ}
                bridge.add ['.', TI(clas.name, 'class'), TI(mem.key.name), typ]
                if mem.val instanceof Fun
                  funcs.push {nodes: [mem.val], ctx: [global-scope], this-type: TI(clas.name, 'class')}
      else if e instanceof Assign && e.left instanceof Var
        global-scope.members.push {name: e.left.value, type: type-of-node(e.left)}
        marks.push mark-for-node(e.left, {title: e.left.value, className: "mark variable"})
        roots.push {nodes: [e], ctx: [global-scope, global-scope]}
        if e.right instanceof Fun
          funcs.push {nodes: [e.right], ctx: [global-scope]}
      else if e instanceof Fun
        funcs.push {nodes: [e], ctx: [global-scope]}
        
  for {nodes, ctx, this-type} in funcs
    for e in nodes
      # Function type
      typ = type-of-node(e)
      params-vec = fresh("P")
      ß.unify typ, TI("->").of(this-type ? fresh(), params-vec, type-of-node(e.body))
      ß.unify params-vec, TI("()").of(...e.params.map type-of-node)
      # Function scope
      fn-scope = {name: "->", members: [], type: fresh("S")}
        scopes.push ..
      if this-type?
        bridge.add ['.', fn-scope.type, TI("this"), this-type]      
      for var-name, var-node of collect-vars [e.body], e.params
        fn-scope.members.push {name: var-name, type: type-of-node(var-node)}
        bridge.add ['.', fn-scope.type, TI(var-name), type-of-node(var-node)]
        marks.push mark-for-node(var-node, {title: var-name, className: "mark variable"})
      roots.push {nodes: e.params ++ [e.body], ctx: [fn-scope] ++ ctx}

  for {nodes, ctx} in roots
    bridge.add-all collect-types nodes, ctx.0, ctx.1
        
  try
    bridge.digest!
  catch e
    if e instanceof Work.Purged then throw e
    console.error e
  
  ast: ast
  db: db
  marks: marks
  symbols: scopes
  unify: ß

  
compile-datalog = (program-text) ->
  db = new TupleStore
  dl = new Datalog db
  
  partition (.rhs.length), concat-map dl~parse-rules, [program-text]
    program-tuples = ..1 |> concat-map (.lhs)
    program-rules = ..0

  db.add-all program-tuples
  dl.rules = program-rules

  ß = new Unifier
    
  bridge = new DatalogBridge(dl, ß)
  bridge.digest!
  
  get-pos = (idx) ->
    xs = program-text.substring(0, idx).split('\n')
    line: xs.length-1
    ch: xs[*-1].length
  
  token-marks = do
    r = /(^|\s)\$(\S+)(?!\S)/g
    while (mo = r.exec program-text)?
      from: get-pos mo.index+mo.1.length
      to: get-pos mo.index+mo.0.length
      options:
        className: "mark variable"
        title: mo.2
  
  db: db
  unify: ß
  marks: token-marks
  symbols: 
    * name: "$"
      members: ß.assn-vars!map ->
        name: it.literal
        type: T(it)
        at: it.literal
    ...

  
foreach-node = (ast, fn, xscope) ->
  if \length of ast
    for element in ast then foreach-node element, fn, xscope
  else
    fn ast, xscope
    ast.traverse-children fn, xscope
  
  
collect-this = (ast) -> {}
  foreach-node ast, (node) !->
    if node instanceof Chain && node.head instanceof Literal &&
       node.head.value == 'this'
      memacc = node.tails[0]
      if memacc instanceof Index && memacc.symbol == '.' && memacc.key instanceof Key
        name = memacc.key.name
        ..[name] = memacc if name not of ..

collect-vars = (stmts, defns) -> {}
  foreach-node defns, (node) !->
    if node instanceof Var
      name = node.value
      ..[name] = node if name not of ..
  foreach-node stmts, (node) !->
    if node instanceof Assign && node.left instanceof Var
      name = node.left.value
      ..[name] = node.left if name not of ..

collect-types = (ast, local-scope, global-scope) -> []
  foreach-node ast, (node) !->
    if node instanceof Chain
      is-typed = false
      for el, i in node.tails
        va = if i > 0 then node.tails[i-1] else node.head
        # . / ::
        if el instanceof Index && el.symbol == '.'
          if el.key instanceof Key
            if el.key.name == 'prototype'
              # t::type
              if ! (node.tails[i+1] instanceof Call)
                typ = parse-type node.tails[i+1 to]
                ..push ['unify', type-of-node(va), typ],
                       ['unify', type-of-node(node), typ]
              else
                typ = parse-type node.tails[i+1].args
                ..push ['unify', type-of-node(node), typ]
              is-typed = true ; break
            else
              ..push ['.', type-of-node(va), TI(el.key.name), type-of-node(el)]
          else if el.key instanceof Literal
            ..push ['.[]', type-of-node(va), type-of-node(el.key), type-of-node(el)]
          else if el.key instanceof Parens
            ..push ['.[]', type-of-node(va), type-of-node(el.key.it), type-of-node(el)]
        # () / !
        else if el instanceof Call
          this-type = 
            if va instanceof Index && i > 0
              type-of-node(if i > 1 then node.tails[i-2] else node.head)
            else global-scope.type
          params-vec = fresh("P")
          ..push ['unify', params-vec, TI("()").of(...el.args.map type-of-node)]
          fn-type = TI('->').of(this-type, params-vec, type-of-node(el))
          ..push ['unify', type-of-node(va), fn-type]
      if !is-typed
        ..push ['unify', type-of-node(node), type-of-node(node.tails[*-1])]
    # block
    if node instanceof Block
      ..push ['unify', type-of-node(node),
        if node.lines.length == 0 then TI('unit')
        else type-of-node(node.lines[*-1])]
    # this
    if node instanceof Literal && node.value == 'this' # && (vthis = lookup(local-scope, 'this'))? && vthis.type?
      ..push ['.', local-scope.type, TI(node.value), type-of-node(node)]
    # Var
    if node instanceof Var
      scope = if lookup local-scope, node.value then local-scope else global-scope
      ..push ['.', scope.type, TI(node.value), type-of-node(node)]
    # lhs = rhs
    if node instanceof Assign
      ..push ['unify', type-of-node(node.left), type-of-node(node.right)], 
             ['unify', type-of-node(node), type-of-node(node.left)]
    # [items]
    if node instanceof Arr
      for item in node.items
        arr-type = TI('[]').of(TI("Array", 'class'), type-of-node(item))
        ..push ['unify', type-of-node(node), arr-type]
    # number / "string"
    if node instanceof Literal
      if node.value is /^\d+$/
        ..push ['unify', type-of-node(node), TI('int')]
      else if node.isString!
        ..push ['unify', type-of-node(node), TI('string')]
    # new T
    if node instanceof Unary and node.op == "new"
      if node.it instanceof Var   # TODO need to check that it's a class
        ..push ['unify', type-of-node(node), TI(node.it.value, 'class')]

            
            
parse-type = (elements) ->
  if elements.length == 1 && \
      (memacc = elements[0]) instanceof Index && memacc.symbol == '.' && memacc.key instanceof Key
    TI(memacc.key.name, 'class')
  else if elements.length == 1 && (va = elements[0]) instanceof Var
    TI(va.value, 'class')
  else if elements.length == 2 && \
    (memacc = elements[0]) instanceof Index && memacc.symbol == '.' && memacc.key instanceof Key && \
    (idxacc = elements[1]) instanceof Index && idxacc.symbol == '.' && idxacc.key instanceof Parens
    TI('[]').of(TI(memacc.key.name, 'class'), TI("'"+idxacc.key.it.value, 'variable'))
  else
    throw new Error "malformed type, '#{elements.map (.toString!) .join ','}'"

type-of-node = (ast) ->
  ast.type ? (ast.type = fresh())

mark-for-node = (ast, options={}) ->
  from: {line: ast.first_line-1, ch: ast.first_column}
  to: 
    if (v = ast.value ? ast.key?.name)? then {line: ast.first_line-1, ch: ast.first_column + v.length}
    else {line: ast.last_line-1, ch: ast.last_column}
  options: {className: "mark variable"} <<< options
  
lookup = (scope, name) ->
  for member in scope.members
    if member.name == name then return member
  


@ <<< {compile-typed-livescript, compile-datalog, CompilationError}
