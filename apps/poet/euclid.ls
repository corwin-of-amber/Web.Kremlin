import require 'prelude-ls'



class Euclid
  norm-sq: ([x,y]) --> x**2 + y**2

  dist-sq: ([x0,y0],[x1,y1]) -->
    (x1 - x0)**2 + (y1 - y0)**2
    
  dist: --> sqrt @dist-sq ...
    
  eq: (xy0, xy1) -> xy0 === xy1
  in: (xy, xys) -> any (=== xy), xys
  
  add: ([x0,y0],[x1,y1]) --> [x0 + x1,y0 + y1]
  sub: ([x0,y0],[x1,y1]) --> [x0 - x1,y0 - y1]
  mul: ([x,y],s) --> [x * s, y * s]
  div: ([x,y],s) --> [x / s, y / s]
  middle: ([sp, ep]) --> @div (@add sp,ep), 2
    
  dot: ([x0,y0],[x1,y1]) --> x0*x1 + y0*y1
    
  seg-dist: --> sqrt @seg-dist-sq ...
    
  seg-dist-sq: ([[x0,y0],[x1,y1]], [x,y]) -->
    l-sq = @dist-sq [x1,y1] [x0,y0]
    if l-sq > 0
      pv = @sub [x,y] [x0,y0]
      wv = @sub [x1,y1] [x0,y0]
      t = @dot pv, wv
      if t >= 0 && t <= l-sq
        prj = @add [x0,y0] @mul wv, t/l-sq
        @dist-sq [x,y] prj
 
  det2x2: ([[a00, a01], [a10, a11]]) -> a00 * a11 - a01 * a10
 
  det3x3: ([[a00, a01, a02], [a10, a11, a12], [a20, a21, a22]]) ->
    a00 * @det2x2([[a11, a12], [a21, a22]]) -
    a01 * @det2x2([[a10, a12], [a20, a22]]) +
    a02 * @det2x2([[a10, a11], [a20, a21]])
    
  circumcircle: ([[x0,y0], [x1,y1], [x2,y2]]) ->
    c0 = @norm-sq [x0, y0]
    c1 = @norm-sq [x1, y1]
    c2 = @norm-sq [x2, y2]
    a  =   @det3x3 [[x0, y0, 1]  [x1, y1, 1]  [x2, y2, 1]]
    b-x = - @det3x3 [[c0, y0, 1]  [c1, y1, 1]  [c2, y2, 1]]
    b-y =   @det3x3 [[c0, x0, 1]  [c1, x1, 1]  [c2, x2, 1]]
    #console.log a, b-x, b-y
    o = [ -b-x / (2*a), -b-y / (2*a) ]
    new Circle(o, (@dist o, [x0,y0]))
      ..toque = a

 
class Point
  (@x, @y) ->
    @at = [@x, @y]
    
  hit-test: (xy) ->
    el: @
    dist: E.dist @at, xy
    mass: 1
    
 
class VLine
  (@x) ->
    
  hit-test: ([x,y]) ->
    el: @
    dist: Math.abs(x - @x)
    mass: 3

class HLine
  (@y) ->
    
  hit-test: ([x,y]) ->
    el: @
    dist: Math.abs(y - @y)
    mass: 3

class Segment
  (@start, @end) ->
    
  hit-test: (xy) ->
    el: @
    dist: E.seg-dist [@start, @end] xy
    mass: 2
    
    
class Circle
  (@center, @radius) ->
    
  hit-test: (xy) ->
    el: @
    dist: Math.abs E.dist(@center, xy) - @radius
    mass: 2
    

class IsoRectangle
  (@west, @north, @east, @south) ->
    
  hit-test: (xy) ->
    dists =
      * Math.abs(xy.0 - @east) if @north < xy.1 < @south
      * Math.abs(xy.0 - @west) if @north < xy.1 < @south
      * Math.abs(xy.1 - @north) if @west < xy.0 < @east
      * Math.abs(xy.1 - @south) if @west < xy.0 < @east
    dists = dists.filter (?)
    el: @
    dist: Math.min ...dists
    mass: 2
    
@E = new Euclid

@ <<< {Euclid, Point, HLine, VLine, Segment, Circle, IsoRectangle}
