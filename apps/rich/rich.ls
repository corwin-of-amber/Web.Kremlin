fs = require \fs
htmldoc = fs.readFileSync "#{projdir}/data/sketch-manual/baseLanguage.html" "utf-8"
texdoc = fs.readFileSync "#{projdir}/data/sketch-manual/baseLanguage.tex" "utf-8"


compile-dom = (dom) ->
  if dom.nodeType == document.TEXT_NODE
    dom.data
  else
    inner = [compile-dom n for n in dom.childNodes] .join ''
    inner = /^\n?([\s\S]*?)(\n\s*)?$/.exec inner .1  # strip leading/trailing \n
    if (clsses = $(dom).attr('class'))?
      for cls in clsses.split /\s+/ .reverse!
        if (f = styles[cls])?
          inner = f inner, {dom} <<< get-attributes dom
    inner


get-attributes = (dom) -> {}
  for att in dom.attributes
    ..[att.nodeName] = att.nodeValue

    
compile-latex = (latex) ->
  t = new TexGrouping()
  compile-latex-groups t.process(latex)
    expand-macros ..
  
compile-latex-groups = (tree) ->
  if tree.root == ''
    jdom = $ '<div>'
  else if tree.root == /^\\/
    jdom = $ '<span>' .add-class 'command' .text tree.root
  else if tree.root == "{}"
    jdom = $ '<span>' .add-class 'group'
  else if tree.root == "$$"
    jdom = $ '<span>' .add-class 'math'
  else
    jdom = $ '<span>'
    
  for sub in tree.subtrees
    if sub instanceof Tree
      jdom.append compile-latex-groups sub
    else
      jdom.append ($ '<span>' .text sub)
  jdom


ungroup = -> it.children!
consume-next = -> ungroup it.next!remove!
find-command = (name) -> commands[if name == /^\\(.*)$/ then that.1 else name]
commands =
  section: -> $ '<h1>' .append consume-next it
  subsection: -> $ '<h2>' .append consume-next it
  seclabel: -> $ '<a>' .attr 'name' (consume-next it .text!)
  C: -> $ '<code>' .append consume-next it
  sqsubseteq: -> $ '<span>' .add-class 'rm' .text "⊑"
  flagdoc: -> 
    $ '<dl>' .add-class 'flagdoc'
      $ '<dt>' .add-class 'parameter' .append consume-next it .append-to ..
      $ '<dd>' .append consume-next it .append-to ..
  
expand-macros = (jdom) ->
  child = $(jdom.children![0])
  while child.length
    if child.has-class 'command' and (f = find-command child.text!)?
      child = do -> f child
        child.replace-with ..
    expand-macros child
    child = child.next!


$ ->
  #$ '#document' .html htmldoc
  #$ '#tex' .text compile document.getElementById 'document'
  $ '#tex' .text texdoc
  $ '#document' .append compile-latex texdoc