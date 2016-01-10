styles =
  section: -> "\\section{#it}"
  subsection: -> "\\subsection{#it}"
  code: -> "\\C{#it}"
  math: -> "$#{it}$"
  symbol: (txt, {latex}) -> latex ? "\\?"
  spaced: (txt, {nspaces}) -> ['', txt, ''].join '~'*(nspaces ? 1)
  paragraph: (txt, {dom}) -> 
    title = $(dom).children('a.title').text!
    "\\paragraph{#title} #txt"
  parameter: -> ''


@ <<< {styles}
