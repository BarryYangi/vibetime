import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const assetsDir = join(root, 'assets')
const buildDir = join(root, 'build')
const sourcePath = join(assetsDir, 'app-icon-source.svg')
const renderedSourcePath = join(buildDir, 'app-icon-source.png')
const previewPath = join(buildDir, 'icon.png')
const trayTemplatePath = join(buildDir, 'trayTemplate.png')
const trayTemplateRetinaPath = join(buildDir, 'trayTemplate@2x.png')
const symbolSourcePath = join(buildDir, 'app-symbol-source.generated.svg')
const trayTemplateSourcePath = join(buildDir, 'tray-template-source.generated.svg')
const iconsetDir = join(buildDir, 'icon.iconset')
const iconPath = join(buildDir, 'icon.icns')
const icoPath = join(buildDir, 'icon.ico')
const icoDir = join(buildDir, 'icon.ico-sizes')
const modernIconDir = join(buildDir, 'AppIcon.icon')
const modernIconAssetsDir = join(modernIconDir, 'Assets')
const modernIconSymbolPath = join(modernIconAssetsDir, 'vibetime-symbol.png')

const sizes = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
]

const windowsSizes = [16, 24, 32, 48, 64, 128, 256]
const logoMarkStart = '<!-- logo-mark:start -->'
const logoMarkEnd = '<!-- logo-mark:end -->'

function renderSvgWithSips(source, output, size) {
  execFileSync(
    'sips',
    ['-s', 'format', 'png', '-z', String(size), String(size), source, '--out', output],
    { stdio: 'ignore' },
  )
}

function renderSvgWithMagick(source, output, size) {
  execFileSync(
    'magick',
    [
      '-background',
      'none',
      source,
      '-filter',
      'Lanczos',
      '-define',
      'filter:blur=0.92',
      '-resize',
      `${size}x${size}!`,
      '-strip',
      `PNG32:${output}`,
    ],
    { stdio: 'ignore' },
  )
}

function renderSvg(source, output, size) {
  if (process.platform === 'darwin') {
    renderSvgWithSips(source, output, size)
    return
  }
  renderSvgWithMagick(source, output, size)
}

function svgDocument(markup) {
  return `<svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">\n${markup}\n</svg>\n`
}

function extractLogoMark(svg) {
  const start = svg.indexOf(logoMarkStart)
  const end = svg.indexOf(logoMarkEnd)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Missing logo mark markers in ${sourcePath}`)
  }
  return svg.slice(start + logoMarkStart.length, end).trim()
}

function monochrome(markup) {
  return markup.replaceAll('#A4D45E', '#000000').replaceAll('#E6FFB3', '#000000')
}

if (!existsSync(sourcePath)) {
  throw new Error(`Missing icon source: ${sourcePath}`)
}

mkdirSync(buildDir, { recursive: true })
rmSync(iconsetDir, { recursive: true, force: true })
rmSync(icoDir, { recursive: true, force: true })
rmSync(modernIconDir, { recursive: true, force: true })
mkdirSync(iconsetDir, { recursive: true })
mkdirSync(icoDir, { recursive: true })
mkdirSync(modernIconAssetsDir, { recursive: true })

const logoMark = extractLogoMark(readFileSync(sourcePath, 'utf8'))
writeFileSync(symbolSourcePath, svgDocument(logoMark))
writeFileSync(
  trayTemplateSourcePath,
  svgDocument(
    `<g transform="translate(100 100) scale(1.18) translate(-100 -100)">\n${monochrome(logoMark)}\n  </g>`,
  ),
)

renderSvg(sourcePath, renderedSourcePath, 1024)
copyFileSync(renderedSourcePath, previewPath)

for (const [size, outputPath] of [
  [20, trayTemplatePath],
  [40, trayTemplateRetinaPath],
]) {
  renderSvg(trayTemplateSourcePath, outputPath, size)
}

renderSvg(symbolSourcePath, modernIconSymbolPath, 1024)
writeFileSync(
  join(modernIconDir, 'icon.json'),
  `${JSON.stringify(
    {
      fill: {
        solid: 'srgb:0.10196,0.12157,0.12941,1.00000',
      },
      groups: [
        {
          'blend-mode': 'normal',
          layers: [
            {
              'image-name': 'vibetime-symbol.png',
              name: 'vibetime-symbol',
              position: {
                scale: 1,
                'translation-in-points': [0, 0],
              },
            },
          ],
          lighting: 'individual',
          shadow: {
            kind: 'neutral',
            opacity: 0.65,
          },
          specular: true,
          translucency: {
            enabled: false,
            value: 0,
          },
        },
      ],
      'supported-platforms': {
        squares: ['macOS'],
      },
    },
    null,
    2,
  )}\n`,
)

for (const [size, name] of sizes) {
  execFileSync(
    'magick',
    [
      renderedSourcePath,
      '-filter',
      'Lanczos',
      '-define',
      'filter:blur=0.92',
      '-resize',
      `${size}x${size}!`,
      '-strip',
      join(iconsetDir, name),
    ],
    { stdio: 'ignore' },
  )
}

const icoInputs = []
for (const size of windowsSizes) {
  const pngPath = join(icoDir, `icon-${size}.png`)
  execFileSync(
    'magick',
    [
      renderedSourcePath,
      '-filter',
      'Lanczos',
      '-define',
      'filter:blur=0.92',
      '-resize',
      `${size}x${size}!`,
      '-strip',
      `PNG32:${pngPath}`,
    ],
    { stdio: 'ignore' },
  )
  icoInputs.push(pngPath)
}
execFileSync('magick', [...icoInputs, icoPath], { stdio: 'ignore' })

if (process.platform === 'darwin') {
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', iconPath], { stdio: 'inherit' })
}
rmSync(iconsetDir, { recursive: true, force: true })
rmSync(icoDir, { recursive: true, force: true })
rmSync(symbolSourcePath, { force: true })
rmSync(trayTemplateSourcePath, { force: true })
