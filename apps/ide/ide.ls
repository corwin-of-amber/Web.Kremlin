Fiber = require \fibers
Future = require 'fibers/future'
Function.prototype.future = Future.future  # nwjs thing


class TextDocument
  (@text="") ->
  
  fromJson: (json) -> @text = json ; @
  toJson: -> @text

doc = new LocalDocument "ide.editor" TextDocument

angular.module 'app' <[ ngStorage ]>
  ..controller 'Ctrl' ($scope, $timeout, $localStorage) ->
    $scope.$ = $localStorage
    
    $scope <<< output: "", error: undefined

    $ ->
      editor = create-editor!
      work = new Work
      editor.on \change -> 
        save editor.getValue!
        Future.task work.start ->
          try
            t = compile!
          catch e
            if e instanceof CompilationError
              return {error: e.err.message}
            else throw e

          {output: t, error: undefined}

        .resolve (err, val) ->
          if err
            if !(err instanceof Work.Purged)
              console.error err.stack  # stack is lost on rethrow :(
              throw err
          else
            $scope.$apply -> $scope <<< val


      $timeout ->
        editor.setValue load!
        
      window <<< {editor}
      
    $scope.hilite = (title, flag) !->
      jq = $ "[title='#title']"
      cname = 'hilite'
      if flag then jq.add-class cname else jq.remove-class cname


create-editor = ->      
  CodeMirror document.getElementById('editor'), do
    lineNumbers: true
    matchBrackets: true
    mode: "livescript"

mark-up = (marks) ->
  for mark in editor.getAllMarks! when mark.className is /\bmark\b/
    mark.clear!
  for {from:from_, to, options} in marks
    editor.markText from_, to, options
    
save = (text) -> doc.content.text = text ; doc.save!
load = -> doc.load! ; doc.content.text

compile = ->
  compile-typed-livescript doc.content.text
  #compile-datalog doc.content.text
    mark-up ..marks || []
    @ <<< .. # for debugging


class Work
  -> @current = void
  start: (fn) -> @reset! ; @enqueue fn
  enqueue: (fn) -> ~>
    @current = Fiber.current
    @current.work = @  # cyclic ref... will be broken when fiber exits or gets replaced
    try
      fn!
    finally
      if @_current == Fiber.current
        @_current = void
  reset: ->
    @_current = void
      
  @_recent = 0
  @rest = ->
    new Date
      if .. - @_recent < 10 then return
      @_recent = ..
    c = Fiber.current
    if c?
      if c.work? && c != c.work.current then throw new @Purged
      to = setTimeout((-> c.run!), 0)
      try
        Fiber.yield!
      catch e
        clearTimeout to    # gotta unwind
        throw e

  class @Purged

    
@ <<< {doc, Work}