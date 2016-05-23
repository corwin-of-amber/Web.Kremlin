fs = require 'fs'
{Files} = require './render'


Configs =
  find: (filename, format='json') ->
    filename = Files.find-closest filename
    if filename
      text = fs.readFileSync filename, 'utf-8'
      if format == 'json'
        {filename, json: JSON.parse text}
      else
        {filename, text}


export Configs
