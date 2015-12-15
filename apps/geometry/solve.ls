
path = require \path
spawn = require('child_process').spawn

solve = (constraints, callback) ->
  p = spawn('python', [path.join(path.dirname(window.location.pathname), "solve.py")])

  buffer = ""
  p.stdout.on \data -> buffer := buffer + it
  p.stderr.on \data -> console.error ''+it

  p.stdout.on \end ->
    console.log buffer
    if (mo = buffer.match /(.*)\n(.*)/)?
      if mo.1 == 'sat'
        callback do
          status: mo.1
          model: JSON.parse mo.2
      else
        callback {status: mo.1}

  for c in constraints
    p.stdin.write(c + "\n")
  p.stdin.end!
      
@ <<< {solve}
