import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const assetsDir = join(root, 'assets')
const buildDir = join(root, 'build')
const sourcePath = join(assetsDir, 'app-icon-source.svg')
const renderedSourcePath = join(buildDir, 'app-icon-source.png')
const previewPath = join(buildDir, 'icon.png')
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

if (!existsSync(sourcePath)) {
  throw new Error(`Missing app icon source: ${sourcePath}`)
}

mkdirSync(buildDir, { recursive: true })
rmSync(iconsetDir, { recursive: true, force: true })
rmSync(icoDir, { recursive: true, force: true })
rmSync(modernIconDir, { recursive: true, force: true })
mkdirSync(iconsetDir, { recursive: true })
mkdirSync(icoDir, { recursive: true })
mkdirSync(modernIconAssetsDir, { recursive: true })

execFileSync(
  'magick',
  [
    '-size',
    '1024x1024',
    'xc:none',
    '-fill',
    '#1A1F21',
    '-draw',
    'roundrectangle 0,0 1023,1023 225,225',
    '-fill',
    'none',
    '-stroke',
    '#A4D45E',
    '-strokewidth',
    '61',
    '-draw',
    'stroke-linecap round stroke-linejoin round polyline 333,307 691,307 512,512 691,717 333,717 512,512 333,307',
    '-stroke',
    '#E6FFB3',
    '-strokewidth',
    '51',
    '-draw',
    'stroke-linecap round stroke-linejoin round polyline 256,435 179,512 256,589',
    '-draw',
    'stroke-linecap round stroke-linejoin round polyline 768,435 845,512 768,589',
    '-stroke',
    'none',
    '-fill',
    'rgba(164,212,94,0.6)',
    '-draw',
    'roundrectangle 410,799 614,840 20,20',
    renderedSourcePath,
  ],
  { stdio: 'ignore' },
)
execFileSync(
  'magick',
  [
    renderedSourcePath,
    '(',
    '-size',
    '1024x1024',
    'xc:none',
    '-fill',
    'white',
    '-draw',
    'roundrectangle 0,0 1023,1023 225,225',
    ')',
    '-alpha',
    'set',
    '-compose',
    'CopyOpacity',
    '-composite',
    renderedSourcePath,
  ],
  { stdio: 'ignore' },
)
execFileSync('cp', [renderedSourcePath, previewPath], { stdio: 'ignore' })

execFileSync(
  'magick',
  [
    '-size',
    '1024x1024',
    'xc:none',
    '-fill',
    'none',
    '-stroke',
    '#A4D45E',
    '-strokewidth',
    '61',
    '-draw',
    'stroke-linecap round stroke-linejoin round polyline 333,307 691,307 512,512 691,717 333,717 512,512 333,307',
    '-stroke',
    '#E6FFB3',
    '-strokewidth',
    '51',
    '-draw',
    'stroke-linecap round stroke-linejoin round polyline 256,435 179,512 256,589',
    '-draw',
    'stroke-linecap round stroke-linejoin round polyline 768,435 845,512 768,589',
    '-stroke',
    'none',
    '-fill',
    'rgba(164,212,94,0.6)',
    '-draw',
    'roundrectangle 410,799 614,840 20,20',
    `PNG32:${modernIconSymbolPath}`,
  ],
  { stdio: 'ignore' },
)
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

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', iconPath], { stdio: 'inherit' })
rmSync(iconsetDir, { recursive: true, force: true })
rmSync(icoDir, { recursive: true, force: true })
