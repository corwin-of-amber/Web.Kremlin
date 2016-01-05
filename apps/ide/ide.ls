

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
      editor.on \change -> $scope.$apply ->
        save editor.getValue!
        try
          t = compile!
          window.t = t
        catch e
          if e instanceof CompilationError
            $scope <<< error: e.err.message
            return
          else throw e

        $scope <<< output: t, error: undefined

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

@ <<< {doc}