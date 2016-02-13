

cwdata =
  idx: {}
  get: ([row, col]) ->
    if cwdata.idx[row]
      that[col]

$.ajax "./data/grid.json", dataType: 'text' 
.done (data, status) ->
  json = data
    .replace /\#.*/g ''
    .replace /(\d+):/g (_, num) -> """"#num":"""
  cwdata.idx = JSON.parse json
  $ \#crossword .trigger 'got-grid'
      
userdata =
  fillin: new HashMap()
  save: -> localStorage["userdata"] = JSON.stringify @
  load: ->
    for own k,v of JSON.parse localStorage["userdata"] ? "{}"
      @[k] <<< v
  new: ->
    @fillin.clear!
    @save!


    
@ <<< {cwdata, userdata}