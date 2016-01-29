styles =
  section: -> "\\section{#it}"
  subsection: -> "\\subsection{#it}"
  math: -> "$#{it}$"
  symbol: (txt, {latex}) -> latex ? "\\?"
  spaced: (txt, {nspaces}) -> ['', txt, ''].join '~'*(nspaces ? 1)
  code: (txt, {dom}) -> 
    if $(dom).css("display") == 'block'
      "\\begin{lstlisting}\n#txt\n\\end{lstlisting}"
    else
      "\\C{#txt}"
  paragraph: (txt, {dom}) -> 
    title = $(dom).children('a.title').text!
    "\\paragraph{#title} #txt"
  flagdoc: (txt, {dom}) ->
    flag = $(dom).children('dt').text!
    "\\flagdoc{#flag}{#txt}"
  parameter: -> ''
  
  itemize: -> "\\begin{itemize}\n#it\n\\end{itemize}"
  item: -> "\\item #it"

  label: (txt, {name, kind}) -> "\\#{kind}label{#name}"
  ref: (txt, {href, kind}) ->
    key = href.replace /^#/, ''
    "\\#{kind}ref{#key}"

  Sketch: -> "\\Sk{}"

@ <<< {styles}
