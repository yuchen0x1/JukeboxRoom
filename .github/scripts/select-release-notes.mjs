import fs from 'node:fs'
import path from 'node:path'

const tag = process.env.GITHUB_REF_NAME || ''
const version = tag.replace(/^v/, '')
const sources = ['docs/releases/release-notes.md', 'RELEASE_NOTES_CN.md']
const explicit = /^v?[\w.-]+$/.test(tag) ? 'docs/releases/' + tag + '.md' : ''
const read = file => file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : ''

// A tagged note can contain a full release template with its own Markdown sections.
let body = read(explicit)
if (!body && /^[0-9]+(?:[.][0-9]+)+(?:[-+][\w.-]+)?$/.test(version)) {
  const literal = version.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&')
  const heading = new RegExp('^##\\s+\\[?v?' + literal + '(?=$|\\]|[\\s（(·])', 'i')
  const titleVersion = new RegExp('(?:^|\\s)v?' + literal + '(?=\\s|$)', 'i')
  for (const source of sources) {
    const lines = read(source).split(/\r?\n/)
    const begin = lines.findIndex(line => heading.test(line))
    if (begin >= 0) {
      const rest = lines.slice(begin + 1)
      const end = rest.findIndex(line => /^#{1,2}\s/.test(line))
      body = rest.slice(0, end < 0 ? undefined : end).join('\n').trim()
    } else if (/^#\s/.test(lines[0]) && titleVersion.test(lines[0]) &&
               !lines.slice(1).some(line => /^#{1,2}\s+(?:Unreleased|\[?v?\d+\.\d+)/i.test(line))) {
      body = lines.slice(1).join('\n').trim()
    }
    if (body) break
  }
}
if (body) {
  const file = path.join(process.env.RUNNER_TEMP, 'release-body.md')
  fs.writeFileSync(file, body + '\n')
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'path=' + file + '\n')
}
// Without matching notes the publish action generates notes for this tag on GitHub.
