fs = require \fs
chokidar = require \chokidar   # file watch utility (fs.watch is not good enough)

LET_RE = /^\s*([\s\S]+?)\s+=\s+([\s\S]+?)\s*$/

LOG_FILENAME = '/tmp/bell.json'


angular.module 'app', [\RecursionHelper]
  ..controller "Ctrl" ($scope) ->
    $scope.data = []

    read = (filename) ->
      fs.readFile filename, 'utf-8', (err, text) ->
        $scope.$apply ->
          try
            console.log text.split '\n\n'
            $scope.data = [{value: JSON.parse(block)} \
                           for block in text.split '\n\n' when block.length>0]
          catch
            void  # probably file is incomplete or has been deleted
    
    watcher = chokidar.watch LOG_FILENAME, {persistent: false}
      ..on 'all' ->
        console.log "Refresh #LOG_FILENAME"
        read LOG_FILENAME
    window.addEventListener 'unload' -> watcher.close!
    
  ..filter "collapse" ->
    lead = -> it.match /^\s*/ .0.length
    (input, indent) ->
      (""+input).split /\n/ \
        .filter (-> lead(it) < indent) \
        .join "\n"
  ..directive "display" (RecursionHelper) ->
    restrict: 'E'
    scope:
      o: '=o'
    template: $ '#display' .html!
    compile: (element) ->
      RecursionHelper.compile(element)
  ..directive "compute" ->
    scope: {}
    transclude: 'element'
    link: (scope, element, attrs, 
           ctrl, $transclude) ->
      expr = attrs.let
      mo = expr?.match LET_RE
      if !mo?
        throw Error("invalid let '#expr'")
      lhs = mo[1]
      rhs = mo[2]
      $transclude (clone, scope) ->
        scope.$watch rhs, (v) ->
          scope[lhs] = v
        , true
        $(clone).insertAfter element

  ..filter "isString" -> _.isString
  
  ..filter "display" ->
    (input) ->
      if _.isString input
        input
      else if input.tape?
        last = 0
        text = input.tape.text
        []
          for [[u,v], mark] in input.tape.markup
            x = text.substring(last,u)
            y = text.substring(u,v)
            cls = ['mark'] ++ (if mark.type? then ['tip'] else [])
            last = v
            if x.length then ..push [x]
            if y.length then ..push [y,cls,mark.type]
          x = text.substring(last)
          if x.length then ..push [x]
        #JSON.stringify input.tape.markup
      else
        [JSON.stringify input]
