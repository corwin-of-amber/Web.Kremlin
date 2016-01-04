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
  
  if ast instanceof Block
    for e in ast.lines
      if e instanceof Class &&
         e.title instanceof Var
        clas = {name: e.title.value, members: []}
        scopes.push clas
        global-scope.members.push {name: clas.name, type: TI("class"), scope: clas}
        console.log e.title.value
        if e.fun.body instanceof Block
          for m in e.fun.body.lines
            if m instanceof Fun
              clas.members.push {name: "->"}
              console.log "->"
              for member-name, member-node of collect-this m.params ++ [m.body]
                clas.members.push {name: member-name, type: type-of-node(member-node)}
              fn-scope = [{name: "this", type: TI(clas.name, 'class')}]
              digest ß, collect-types m.params ++ [m.body], fn-scope, global-scope.members
            if m instanceof Obj
              for mem in m.items
                clas.members.push {name: mem.key.name}
                console.log mem.key.name
                
  ast: ast
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
  
  term-to-atom = (id) -> "#{if id.root.kind == 'variable' then '$' else''}#{id.root.literal}"
  atom-to-term = (s) -> if (mo = s is /^\$(.*)/) then TV(mo.1) else TI(s)
  subst-atom = (atom) -> term-to-atom ß.normalize-var atom-to-term(atom)
  subst-in-tuples = (tuples) ->
    for tuple in db.tuples
      [subst-atom(atom) for atom in tuple]
  gen-eqs = ->
    vars = ß.assn-vars!map T(_)
    for v in vars when !(t = ß.normalize v).is-leaf!
      ["=", term-to-atom(v), term-to-atom(t), ...t.subtrees.map term-to-atom]
    # TODO deeper trees
  
  rev = ß.rev

  loop
    dl.digest!
    eqs = db.tuples.filter -> it.0 == "=" || it.0 == "unify"
    eqs.for-each -> ß.unify atom-to-term(it.1), atom-to-term(it.2).of(...it[3 to].map atom-to-term)
    
    if rev > 100 then throw new Exception "fixpoint limit reached"
    
    if rev == ß.rev then break
    else
      rev = ß.rev
      db.tuples = subst-in-tuples db.tuples
      db.add-all gen-eqs!
  
  get-pos = (idx) ->
    xs = program-text.substring(0, idx).split('\n')
    line: xs.length-1
    ch: xs[*-1].length
  
  token-marks = do
    r = /\$(\S+)/g
    while (mo = r.exec program-text)?
      from: get-pos mo.index
      to: get-pos mo.index+mo.0.length
      options:
        className: "mark variable"
        title: mo.1
  
  db: db
  unify: ß
  marks: token-marks
  symbols: 
    * name: "$"
      members: ß.assn-vars!map -> {name: it.literal, type: T(it)}
    ...

  
foreach-node = (ast, fn, xscope) ->
  if \length of ast
    for element in ast then foreach-node element, fn, xscope
  else
    fn ast, xscope
    ast.traverse-children fn, xscope
  
  
collect-this = (ast) ->
  {}
    foreach-node ast, (node) !->
      if node instanceof Chain && node.head instanceof Literal &&
         node.head.value == 'this'
        memacc = node.tails[0]
        if memacc instanceof Index && memacc.symbol == '.' && memacc.key instanceof Key
          name = memacc.key.name
          ..[name] = memacc if name not of ..

collect-types = (ast, local-scope, global-scope) -> []
  foreach-node ast, (node) !->
    if node instanceof Chain
      is-typed = false
      for el, i in node.tails
        # . / ::
        if el instanceof Index && el.symbol == '.' && el.key instanceof Key
          va = if i > 0 then node.tails[i-1] else node.head
          if el.key.name == 'prototype'
            # t::type
            typ = parse-type node.tails[i+1 to]
            ..push ['unify', type-of-node(va), typ],
                   ['unify', type-of-node(node), typ]
            is-typed = false ; break
          else
            if va instanceof Literal && va.value == 'this' && (vthis = lookup(local-scope, 'this'))? && vthis.type? && vthis.type.root.kind == 'class'
              # @member
              clas = lookup(global-scope, vthis.type.root.literal)
              if clas.scope? && (vclas = lookup(clas.scope.members, el.key.name))? && vclas.type?
                ..push ['unify', type-of-node(el), vclas.type]
      if !is-typed
        ..push ['unify', type-of-node(node), type-of-node(node.tails[*-1])]
    # this
    if node instanceof Literal && node.value == 'this' && (vthis = lookup(local-scope, 'this'))? && vthis.type?
      ..push ['unify', type-of-node(node), vthis.type]
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

lookup = (scope, name) ->
  for member in scope
    if member.name == name then return member
  
digest = (ß, type-assignments) ->
  for cmd in type-assignments
    if cmd[0] == 'unify'
      ß.unify cmd[1], cmd[2]


@ <<< {compile-typed-livescript, compile-datalog, CompilationError}
