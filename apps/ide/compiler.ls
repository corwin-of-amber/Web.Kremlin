LiveScript = require 'LiveScript'

{Block,Class,Fun,Var,Obj,Prop,Literal,Chain,Index,Key,Assign,Arr} = LiveScript.ast


class CompilationError
  (@err) ->


fresh = (name="T") -> TI("#{name}_#{fresh.cnt++}", 'variable')
fresh.cnt = 0

compile-typed-livescript = (program-text) ->
  try
    ast = LiveScript.ast program-text
  catch e
    throw new CompilationError(e)
  
  global-scope = {name: "global", members: []}
  scopes = [global-scope]
  ß = new Unifier
  
  db = new TupleStore
  bridge = new DatalogBridge new Datalog(db), ß
  
  bridge.dl.rules = bridge.dl.parse-rules """    
= t_ [] Array e_
  . t_ 1 e_ & . t_ length int

. cls_ mem_ typ1_ & . cls_ mem_ typ2_
  unify typ1_ typ2_
"""

  fresh.cnt = 0  # @@ just cause it's annoying

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
              fn-scope = {name: "->", type: fresh("S")}
              bridge.add ['.', fn-scope.type, TI("this"), TI(clas.name, 'class')]
              collect-types m.params ++ [m.body], fn-scope, global-scope
                bridge.add-all ..
            if m instanceof Obj
              for mem in m.items
                clas.members.push {name: mem.key.name}
                #console.log mem.key.name
      else if e instanceof Fun
        fn-scope = {name: "->", members: [], type: fresh("S")}
          scopes.push ..
        for var-name, var-node of collect-vars e.params ++ [e.body]
          fn-scope.members.push {name: var-name, type: type-of-node(var-node)}
          bridge.add ['.', fn-scope.type, TI(var-name), type-of-node(var-node)]
          marks.push mark-for-node(var-node, {title: var-name, className: "mark variable"})
        collect-types e.params ++ [e.body], fn-scope, global-scope
          bridge.add-all ..
                
  bridge.digest!
  
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

collect-vars = (ast) -> {}
  foreach-node ast, (node) !->
    if node instanceof Var
      name = node.value
      ..[name] = node if name not of ..

collect-types = (ast, local-scope, global-scope) -> []
  foreach-node ast, (node) !->
    if node instanceof Chain
      is-typed = false
      for el, i in node.tails
        # . / ::
        if el instanceof Index && el.symbol == '.'
          va = if i > 0 then node.tails[i-1] else node.head
          if el.key instanceof Key
            if el.key.name == 'prototype'
              # t::type
              typ = parse-type node.tails[i+1 to]
              ..push ['unify', type-of-node(va), typ],
                     ['unify', type-of-node(node), typ]
              is-typed = true ; break
            else
              ..push ['.', type-of-node(va), TI(el.key.name), type-of-node(el)]
          else if el.key instanceof Literal
            key = -> if it is /^\d+$/ then +it else it
            ..push ['.', type-of-node(va), TI(key el.key.value), type-of-node(el)]
      if !is-typed
        ..push ['unify', type-of-node(node), type-of-node(node.tails[*-1])]
    # this
    if node instanceof Literal && node.value == 'this' # && (vthis = lookup(local-scope, 'this'))? && vthis.type?
      ..push ['.', local-scope.type, TI(node.value), type-of-node(node)]
    # Var
    if node instanceof Var
      ..push ['.', local-scope.type, TI(node.value), type-of-node(node)]
    # lhs = rhs
    if node instanceof Assign
      ..push ['unify', type-of-node(node.left), type-of-node(node.right)]
    # [items]
    if node instanceof Arr
      for item in node.items
        arr-type = TI('[]').of(TI("Array", 'class'), type-of-node(item))
        ..push ['unify', type-of-node(node), arr-type]

            
            
parse-type = (elements) ->
  if elements.length == 1 && (memacc = elements[0]) instanceof Index && memacc.symbol == '.' && memacc.key instanceof Key
    TI(memacc.key.name, 'class')
  else
    throw new Error "malformed type, '#{elements.map (.toString!) .join ','}'"

type-of-node = (ast) ->
  ast.type ? (ast.type = fresh())

mark-for-node = (ast, options={}) ->
  from: {line: ast.first_line-1, ch: ast.first_column}
  to: 
    if ast.value? then {line: ast.first_line-1, ch: ast.first_column + ast.value.length}
    else {line: ast.last_line-1, ch: ast.last_column}
  options: {className: "mark variable"} <<< options
  
lookup = (scope, name) ->
  for member in scope.members
    if member.name == name then return member
  
digest = (ß, type-assignments) ->
  for cmd in type-assignments
    if cmd[0] == 'unify'
      ß.unify cmd[1], cmd[2]


@ <<< {compile-typed-livescript, compile-datalog, CompilationError}
