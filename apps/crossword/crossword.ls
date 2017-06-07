BLANK = String.fromCharCode(160)  # non-breaking space

mcell =
  style: (td) ->
    [i,j] = td.data \rowcol
    td.empty!remove-class \black
    if cwdata.idx[i]
      if v = that[j]
        if v == "x"
          td.add-class \black
        else
          td.append ($ "<i>" .text v)
    td.append ($ "<p>" .text BLANK)

  events: (td) ->
    td.click -> $(this).find 'p' .focus!
    td.focusin ->
      if ! mcell.highlight-sequence $(this)
        mcell.toggle-dir!
        mcell.highlight-sequence $(this)
    td.dblclick ->
       mcell.toggle-dir!
       mcell.highlight-sequence $(this)
    td.keydown (e) ->
      switch e.which
      case 39 then   mcell.move $(this), \right  ;  e.preventDefault!
      case 37 then   mcell.move $(this), \left  ;  e.preventDefault!
      case 40 then   mcell.move $(this), \down  ;  e.preventDefault!
      case 38 then   mcell.move $(this), \up    ;  e.preventDefault!
      case 8
        if $(this).find 'p' .text! != BLANK
          $(this).find 'p' .text BLANK
        else
          mcell.move $(this), mcell.opposite[mcell.sequence-dir] .text BLANK
        e.preventDefault!
    td.keypress (e) ->
      $(this).find 'p' .text ''
    td.on \input \p ->
      # persist the change
      txt = $(this).text!
      userdata.fillin.set ($(this).parent!data \rowcol), txt
      userdata.save!
      # advance
      if $(this).text! != BLANK
        mcell.move $(this).parent!, mcell.sequence-dir

  get: (rowcol) ->
    eq = (a, b) -> a[0] == b[0] && a[1] == b[1]
    return $ \td .filter -> eq ($(this).data \rowcol), rowcol

  get-neighbour: (td, drow, dcol) ->
    [i,j] = td.data \rowcol
    i += drow; j += dcol
    return mcell.get [i,j]

  move: (td, dir) ->
    switch dir
    case 'right' then  td.next!.find 'p' .focus!
    case 'left' then   td.prev!.find 'p' .focus!
    case 'down'
      (mcell.get-neighbour td, 1, 0) .find 'p' .focus!
    case 'up'
      (mcell.get-neighbour td, -1, 0) .find 'p' .focus!

  sequence-dir: "left"
  opposite: {'right': 'left', 'left': 'right', 'up': 'down', 'down': 'up'}

  toggle-dir: ->
    d = {'left': 'down', 'down': 'left'}
    mcell.sequence-dir = d[mcell.sequence-dir]

  highlight-sequence: (td) ->
    $ \.highlit .remove-class \highlit
    at = td.data \rowcol
    thru = (f) ->
      _td = td; _at = e = at
      while _td.length > 0 && (cwdata.get _at) != \x
        _td.add-class \highlit; e = _at
        _at = f _at; _td = mcell.get _at
      e
    if mcell.sequence-dir == "left"
      s = thru (at)->[at[0], at[1]+1]
      e = thru (at)->[at[0], at[1]-1]
    else
      s = thru (at)->[at[0]+1, at[1]]
      e = thru (at)->[at[0]-1, at[1]]
    eq = (a, b) -> a[0] == b[0] && a[1] == b[1]
    ! eq s, e


export mcell


$ ->
  cw = $ \#crossword
  for i in [1 to 13]
    tr = $ "<tr>"
    for j in [1 to 13]
      td = $ "<td>"
      td.data 'rowcol', [i,j]
      mcell.events td
      tr.append (td)
    cw.append tr

  # Re-read previously filled-in letters
  userdata.load!

  cw.on 'got-grid' ->
    for td in $ '#crossword td'
      mcell.style $(td)
    $ 'td p' .attr 'contenteditable' ''
    userdata.fillin.for-each (v, k) ->
      mcell.get k .find 'p' .text v

  $ ->
    $ '#clear' .click ->
      userdata.new!
      $ 'td p' .text ""

    $ '#download' .click -> download!

