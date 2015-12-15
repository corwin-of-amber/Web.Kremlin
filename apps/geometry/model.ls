path = require \path
fs = require \fs
{zip, minimum-by, partition, concat, concat-map} = require 'prelude-ls'


app = angular.module 'app' []
  ..controller \Sketch ($scope) ->
    $scope.vrule = []
    $scope.hrule = []
    $scope.point = []
    $scope.circle = []
    $scope.iso-rectangle = []
    $scope.elements = []
    
    hit-test = (xy) ->
      ht = $scope.elements.map (.hit-test xy)
      minimum-by (-> (it.dist + 1) * it.mass), ht
    
    $scope.move-ev = ($event) ->
      svg = $($event.target).closest('svg')
      $scope.tip = [$event.pageX - svg.offset().left, $event.pageY - svg.offset().top]
      $scope.selected = hit-test $scope.tip
    
    for i from 0 til 10 then db.add [\s i, i+1]
    for i from 0 til 5
      db.add [\. \x i, "x.#i"]
      db.add [\. \p i, "p.#i"]
      db.add [\. \box i, "box.#i"]
      db.add [\. "box.#i" \me "box.#i.me"]
      db.add [\. "box.#i" \mw "box.#i.mw"]
    db.add [\# \x 5]
    db.add-all [
      [\emit '[canvas.north] == 0']  [\emit '[canvas.south] == 480']
      [\emit '[canvas.east] == 640'] [\emit '[canvas.west] == 0']
      #[\point \NE \canvas.east \canvas.north]
      #[\point \SW \canvas.west \canvas.south]
      ]
      
    here = path.dirname(window.location.pathname)
      
    library = fs.read-file-sync path.join(here, "programs/library"), 'utf-8'

    main = fs.read-file-sync path.join(here, "programs/program"), 'utf-8'
    
    d = new Datalog db
    
    partition (.rhs.length), concat-map d~parse-rules, [library, main]
      program-tuples = ..1 |> concat-map (.lhs)
      program-rules = ..0
    
    db.add-all program-tuples
    d.rules = program-rules
      
    d.digest!
    
    x-data = db.query-v 'x-data x_' .map (.x_)
    mkvec = -> 
      if it.length == 0 then "()"
      else it.map (-> "[#{it}]") |> (* ',') |> -> "(#{it},)"
    db.add [\emit "[m] == avg(#{mkvec x-data})"]
    db.add [\emit "[V] == avg(sqdists(#{mkvec x-data}, [m]))"]
        
    constraints = db.query-v 'emit c_' .map (.c_)
    console.table constraints.map -> [it]
    
    solve constraints, ->
      model = it.model
      $scope.$apply ->
        $scope.vrule = 
          db.query-v 'vrule x_' .map ({x_})-> 
            new VLine model[x_]
              ..name = x_
        $scope.hrule = 
          db.query-v 'hrule y_' .map ({y_}) -> 
            new HLine model[y_]
              ..name = y_
        $scope.point =
          db.query-v 'point P_ x_ y_' .map ({P_,x_,y_}) ->
            new Point model[x_], model[y_]
              ..name = P_
        $scope.segment =
          db.query-v 'segment l_ A_ B_ & point A_ x1_ y1_ & point B_ x2_ y2_' .map ({l_,x1_,y1_,x2_,y2_}) ->
            new Segment [model[x1_], model[y1_]], [model[x2_], model[y2_]]
              ..name = l_
        $scope.circle =
          db.query-v 'circle c_ O_ r_ & point O_ x_ y_' .map ({c_,x_,y_,r_}) ->
            new Circle [model[x_], model[y_]], model[r_]
              ..name = c_
        $scope.iso-rectangle =
          db.query-v 'iso-rectangle r_ w_ n_ e_ s_' .map ({r_,w_,n_,e_,s_}) ->
            new IsoRectangle model[w_], model[n_], model[e_], model[s_]
              ..name = r_
        $scope.elements = $scope.vrule ++ $scope.hrule ++ $scope.point ++ $scope.segment ++ $scope.circle ++ $scope.iso-rectangle
        

class TupleStore

  ->
    @tuples = []
    
  add: (tuple) ->
    if !@has tuple
      @tuples.push tuple
    
  add-all: (tuples) ->
    tuples.for-each @~add
    
  has: (tuple) ->
    @tuples.some (=== tuple)
    
  rev:~
    -> @tuples.length
    
  query: (patterns, valuation ? new Valuation) ->
    if typeof patterns == 'string'
      @query @parse-tuples(patterns), valuation
    else if patterns.length == 0
      [[valuation]]
    else
      atom = patterns[0]
      mo = @find-all valuation.mask atom .tuples
      rows = mo.map ~>
        v = valuation.clone!unify atom, it
        [[it, ...x] for x in @query patterns[1 to], v]
      [].concat ...rows
    
  query-v: (patterns, valuation ? new Valuation) ->
    @query patterns, valuation .map -> it[*-1].values
    
  find-all: (pattern) ->
    new TupleStore
      ..tuples = [t for t in @tuples 
                  when @matches pattern, t]

  @matches = (pattern, tuple) ->
    pattern.length == tuple.length && \
    zip pattern, tuple .every ->
      (it.0 == undefined) || (it.0 == it.1)
      
  matches: @matches
    
  toString: ->
    JSON.stringify @tuples
      
  # -----------
  # Parser part
  # -----------
  
  parse-tuples: (text) ->
    strings = []
    text = text.replace /"(.*?)"/g, (matched, group) ->
      i = strings.length
      strings.push group
      '"' + i
    atoms = text.split /[,&]/
    for atom in atoms
      atom.trim!split /\s+/ .filter (!= '') .map ~>
        @parse-literal it, strings
        
  parse-literal: (text, strings={}) ->
    if text == /^\d+$/
      parseInt text
    else if (mo = (text == /^"(\d+)$/))?
      strings[parseInt mo.1]
    else
      text

      
class Valuation

  (@values ? {}) ->
    
  @is-var = (x) -> typeof x == "string" && x is /_$/
    
  is-var: @is-var
    
  mask: (pattern) ->
    pattern.map ~> if @is-var it then @values[it] else it
    
  unify: (pattern, tuple) ->
    # assumes TupleStore.matches @mask(pattern), tupleass
    zip pattern, tuple .forEach ~>
      if @is-var it.0 and it.0 != '_'
        @values[it.0] = it.1
    @
  
  get: -> @values[it]
  
  interpolate: (str) ->
    str.replace /\[(.*?_)\]/g, (matched, group) ~>
      if (val = @get(group))
        "[#val]"
      else matched
  
  clone: -> new Valuation({} <<< @values)
    


class Datalog
  (@db, @rules=[]) ->

  digest: ->
    rev = 0
    while rev != @db.rev
      rev = @db.rev
      @rules.for-each @~process
    
  parse-rules: (text) ->
    text.split /\n(?=\S)/ .map ->
      lines = it.split /\n/
      lhs: lines.filter (!= /^\s/) |> concat-map @db~parse-tuples
      rhs: lines.filter (== /^\s/) |> concat-map @db~parse-tuples
    
  process: (rule) ->
    if rule.map?
      rule.map @~process
    else
      db = @db
      db.query rule.lhs .map ->
        v = it[*-1]
        for atom in rule.rhs .map v~mask
          if atom[0] == "emit"
            db.add [atom[0], v.interpolate atom[1]]
          else
            db.add v.mask atom
    
      
db = new TupleStore

@ <<< {db, d: new Datalog db}
