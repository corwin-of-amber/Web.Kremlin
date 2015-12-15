import require 'prelude-ls'



class Path
  ->
    @points = [[50,50]]
    @closed = false
    
  fromJson: (json) ->
    if json.meta?
      for [pt,m] in zip json.points, json.meta
        pt <<< m
      @ <<< {json.points, json.closed}
    @
    
  toJson: ->
    meta = [{..cmd} for @points]
    {@points, @closed, meta}



class PathEditor extends Euclid
  (path) ->
    @ <<< {path.points, path.closed}
    @renum!
    @grab = {pts: [], ofs: void}
    
  renum: ->
    for m,i in @points
      m.$idx = i
    
  segments: ->
    if @closed
      rot = (split-at 1) >> reverse >> concat
    else
      rot = drop 1
    zip @points, rot @points
    
  hit-test-dist: ([x,y], obj-xys) ->
    [s,e] = obj-xys
    if e then E.seg-dist-sq([s,e], [x,y])
    else E.dist-sq([x,y],s)/4
        
  hit-test: ([x,y]) ->
    f = (xy) ~> @hit-test-dist([x,y],xy)
    points = [[..] for @points]
    segs = @segments!
    minimum-by f, points ++ segs
    
  hit-test-ev: (event) ->
    @hit-test [event.offsetX, event.offsetY]
  
  #hit-test-seg: ([x,y]) ->
  #  rot = (split-at 1) >> reverse >> concat
  #  f = (seg) ~> @seg-dist-sq seg,[x,y]
  #  minimum-by f, zip @points, rot @points

  #hit-test-seg-ev: (event) ->
  #  ev-xy = [event.offsetX, event.offsetY]
  #  @hit-test-seg ev-xy

  offset: (xy) ->
    for m in @points
      if m.$idx == xy.$idx
        return E.sub xy, m
  
  offset-ev: (event) ->
    if @grab.pts.0
      xy = [event.offsetX, event.offsetY]
        ..$idx = @grab.pts.0.$idx
      @offset xy
  
  set: (xy) ->
    for m in @points
      if m.$idx == xy.$idx
        m[0] = xy[0]
        m[1] = xy[1]
        
  set-ev: (event) ->
    shift-it = (xy, p) ~>
      d0 = E.sub xy, @grab.ofs 
      d1 = E.sub p, @grab.pts.0
      E.add d0, d1
        ..$idx = p.$idx

    xy = [event.offsetX, event.offsetY]
    pts = [shift-it xy, .. for @grab.pts]
    for pts
      @set ..
      
  ins: (idx, xy) ->
    if !xy?
      if idx > 0
        seg = [@points[idx-1], @points[idx]]
        xy = E.middle seg
      else
        xy = E.sub @points[idx], [10,10]
    @points.splice idx, 0, xy
    @renum!
    
  del: (idx) ->
    @points.splice idx, 1
    @renum!
      
  mkcmd: (cmd, pts, last-pt) ->
    if cmd=="A"        # arc is special
      d = E.dot (E.sub last-pt, pts[0]), (E.sub pts[1], pts[0])
      c = E.circumcircle [last-pt, pts[0], pts[1]]
      r = c.radius
      lrg = if d >= 0 then 1 else 0
      ccw = if c.toque >= 0 then 1 else 0
      "A #r #r 0 #lrg #ccw #{pts.1.0} #{pts.1.1}"
    else
      cmd + ["#{..0} #{..1}" for pts].join " "
    
  mkpathd: ->
    queue = [.. for @points]
    nargs = {"L": 1, "Q": 2, "A": 2}
    dflt = "M"
    last-pt = undefined
    cmds =
     while (pt = queue.0)
      cmd = pt.cmd || dflt ; dflt = "L"
      n = nargs[cmd] || 1
      pts = [queue.shift! for til n]
      @mkcmd cmd, pts, last-pt
        .. ; last-pt = pts[*-1]
    cmds.join " "

  mousedown-ev: (event) ->
    if event.metaKey && event.which == 1
      if @grab.pts.length == 1
        @del @grab.pts.0.$idx
      
  mousemove-ev: (event) ->
    if event.which == 0
      @grab.pts = @hit-test-ev event or []
      @grab.ofs = @offset-ev event
    else if event.which == 1
      @set-ev event
    event.stop-propagation!
    true
    
  mouseleave-ev: ->
    @grab.pts = []
    
  dblclick-ev: (event) ->
    if @grab.pts.length > 0
      @ins @grab.pts[*-1].$idx
    else
      at = [event.offsetX, event.offsetY]
      @ins @points.length, at



@ <<< {Path,PathEditor}