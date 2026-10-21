// Minimal hash router: #/  ·  #/t/:id  ·  #/t/:id/:tab
function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  return parts
}

export const route = $state({ parts: parse() })

window.addEventListener('hashchange', () => {
  route.parts = parse()
  window.scrollTo({ top: 0 })
})

export const href = (...parts: string[]) => '#/' + parts.map(encodeURIComponent).join('/')
export const go = (...parts: string[]) => (location.hash = href(...parts))
