

import require 'prelude-ls'




class LocalDocument
  (@key, @cls) ->
    @content = new @cls
  
  load: ->
    c = new @cls
    v = localStorage[@key]
    if v?
      json = JSON.parse v
      @content = c.fromJson json
    else
      @content = c
    @

  save: ->
    localStorage[@key] = 
      JSON.stringify @content.toJson!


@ <<< {LocalDocument}