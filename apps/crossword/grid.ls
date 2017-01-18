

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
  save: -> 0 # localStorage["userdata"] = JSON.stringify @
  load: ->
    for own k,v of JSON.parse localStorage["userdata"] ? "{}"
      @[k] <<< v
  new: ->
    @fillin.clear!
    @save!


download = ->
  fs = require 'fs'  /* this only works on Node atm */
  new JSZip()
    ..file 'data.json' JSON.stringify {cwdata, userdata}
    ..file 'birman.png' fs.readFileSync 'data/birman.png'
    ..generateAsync type: 'blob' .then ->
      console.log it
      saveAs it, "birman-#{datestamp!}.zip"

upload = (fn) ->
  fs = require 'fs'  /* this only works on Node atm */
  data = fs.readFileSync fn
  JSZip.loadAsync data
  .then -> it.file('data.json').async('string').then JSON.parse .then ->
    cwdata <<< it.cwdata
    for own k,v of it.userdata
      userdata[k] <<< v
    $ \#crossword .trigger 'got-grid'


datestamp = ->
  d = new Date
  pad2 = -> ('0' + it).slice(-2)
  "#{d.getFullYear!}#{pad2 d.getMonth!+1}#{pad2 d.getDate!}"

  #("0" + d.getDate()).slice(-2) + "-" + ("0"+(d.getMonth()+1)).slice(-2) + "-" +
  #  d.getFullYear() + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);


@ <<< {cwdata, userdata, download, upload}
