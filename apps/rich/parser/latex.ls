

class TexGrouping

  TOKEN_RE = // ([{$]) | ([}]) | (\\\w+) | (\\\W) | (\s+) //g
  MATCHING = {'{': '}', '$': '$'}
  
  process: (text) ->
    out = T('') ; stack = [out]
    pos = 0
    emit = (text) -> stack[*-1].subtrees.push text
    enter = (tok) -> T(tok)
    leave = (tree, tok) -> tree.root += tok ; tree
    matches = (tok) -> tok == MATCHING[stack[*-1].root]
    while (mo = TOKEN_RE.exec(text))?
      if mo.index != pos
        emit text.substr(pos, mo.index - pos)
      if matches(mo.0) then emit leave(stack.pop!, mo.0)
      else if mo.0 of MATCHING then stack.push enter(mo.0)
      else if mo.2 || mo.3 then emit T(mo.0)
      else emit mo.0
      
      pos = mo.index + mo.0.length
    
    while stack.length > 1
      emit leave(stack.pop!, '')
    
    out


@ <<< {TexGrouping}