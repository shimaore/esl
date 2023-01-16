import coffeeScriptPlugin from 'esbuild-coffeescript'
import esbuild from 'esbuild'

esbuild.build({
  entryPoints: [ 'src/esl.litcoffee' ],
  bundle: true,
  format: 'cjs',
  outfile: 'esl.cjs',
  plugins: [
    coffeeScriptPlugin({
      bare: true,
      literate: true,
    })
  ],
  platform: 'node',
  target: 'node18',
})

esbuild.build({
  entryPoints: [ 'src/esl.litcoffee' ],
  bundle: true,
  format: 'esm',
  outfile: 'esl.mjs',
  plugins: [
    coffeeScriptPlugin({
      bare: true,
      literate: true,
    })
  ],
  platform: 'node',
  target: 'node18',
})
