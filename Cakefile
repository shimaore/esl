config = require './package.json'
cs = require 'coffee-script'
fs = require 'fs'

task 'build', 'build the code', (options) ->
  try fs.mkdirSync 'lib'
  for f in config.files
    g = f.replace(/\.js$/, '.coffee.md').replace(/lib\//,'src/')
    console.log "Compiling #{g} into #{f}"
    code = fs.readFileSync g, 'utf-8'
    fs.writeFileSync f, cs.compile(code, literate:true), 'utf-8'

task 'clean', 'cleanup the build', (options) ->
  for f in config.files
    fs.unlink f, ->
