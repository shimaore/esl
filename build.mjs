import esbuild from 'esbuild'

esbuild.build({
  entryPoints: [ 'src/esl.ts' ],
  bundle: true,
  format: 'cjs',
  outfile: 'esl.cjs',
  platform: 'node',
  target: 'node18',
})

esbuild.build({
  entryPoints: [ 'src/esl.ts' ],
  bundle: true,
  format: 'esm',
  outfile: 'esl.mjs',
  platform: 'node',
  target: 'node18',
})
