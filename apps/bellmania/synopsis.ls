fs = require \fs
chokidar = require \chokidar   # file watch utility (fs.watch is not good enough)

LET_RE = /^\s*([\s\S]+?)\s+=\s+([\s\S]+?)\s*$/

LOG_FILENAME = '/tmp/bell.json'


class RefIds

  -> @id2obj = {}

  clear: -> @id2obj = {} ; @
  
  collect: (data) ->
    recurse = (term) ~>
      if (key = term._id)? then @id2obj[key] = term
      term.subtrees?.forEach recurse
    for doc in data
      if (term = doc.term)? || (term = doc.value.term)?
        recurse term
      
  deref: (obj) ->
    if (id = obj.ref)? then @id2obj[id] || obj
    else obj
  

_refIds = new RefIds
  

angular.module 'app', [\RecursionHelper]
  ..controller "Ctrl" ($scope) ->
    $scope.data = []

    read = (filename) ->
      fs.readFile filename, 'utf-8', (err, text) ->
        $scope.$apply ->
          try
            $scope.data = [{value: JSON.parse(block), index: i} \
                           for block, i in text.split '\n\n' when block.length>0]
            _refIds.clear!collect $scope.data
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
            _refIds.collect [mark]
            if mark.term?
              term = _refIds.deref(mark.term)
              ns = term.root.ns || "global"
            
            x = text.substring(last,u)
            y = text.substring(u,v)
            cls = ['mark'] ++ (if mark.type? then ['tip'] else [])
            last = v
            if x.length then ..push [x]
            if y.length then ..push [y,cls,mark.type + " (#ns)"] #deref(mark.term).root.ns]
          x = text.substring(last)
          if x.length then ..push [x]
        #JSON.stringify input.tape.markup
      else
        [JSON.stringify input]
