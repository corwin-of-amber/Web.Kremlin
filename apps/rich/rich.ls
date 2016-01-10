fs = require \fs
ctext = fs.readFileSync "#{projdir}/data/sketch-manual/baseLanguage.html" "utf-8"



compile = (dom) ->
  if dom.nodeType == document.TEXT_NODE
    dom.data
  else
    inner = [compile n for n in dom.childNodes] .join ''
    inner = /^\n?([\s\S]*?)\n?$/.exec inner .1  # strip leading/trailing \n
    if (clsses = $(dom).attr('class'))?
      for cls in clsses.split /\s+/ .reverse!
        if (f = styles[cls])?
          inner = f inner, {dom} <<< get-attributes dom
    inner


get-attributes = (dom) -> {}
  for att in dom.attributes
    ..[att.nodeName] = att.nodeValue


$ ->
  $ '#document' .html ctext
  $ '#tex' .text compile document.getElementById 'document'
