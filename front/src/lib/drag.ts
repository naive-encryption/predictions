// Tiny pointer-based drag & drop that works with mouse and touch.
// Mouse: drag after a few px of movement. Touch: press and hold briefly, then drag
// (so normal scrolling still works). A plain click/tap still fires `click`.

type DropHandler = (payload: unknown) => void
const zones = new WeakMap<Element, DropHandler>()

export function dropZone(node: HTMLElement, onDrop: DropHandler) {
  node.dataset.drop = ''
  zones.set(node, onDrop)
  return {
    update(fn: DropHandler) {
      zones.set(node, fn)
    },
    destroy() {
      zones.delete(node)
    },
  }
}

export function draggable(node: HTMLElement, opts: { payload: unknown; disabled?: boolean }) {
  let o = opts
  let start: { x: number; y: number; id: number; type: string } | null = null
  let ghost: HTMLElement | null = null
  let hover: Element | null = null
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let armed = false // touch hold elapsed
  let suppressClick = false

  const targetAt = (x: number, y: number) => {
    ghost && (ghost.style.visibility = 'hidden')
    const el = document.elementFromPoint(x, y)?.closest('[data-drop]') ?? null
    ghost && (ghost.style.visibility = '')
    return el
  }

  const begin = (x: number, y: number) => {
    const r = node.getBoundingClientRect()
    ghost = node.cloneNode(true) as HTMLElement
    ghost.classList.add('drag-ghost')
    Object.assign(ghost.style, { width: `${r.width}px`, left: `${x - r.width / 2}px`, top: `${y - r.height / 2}px` })
    document.body.appendChild(ghost)
    document.body.classList.add('dragging')
    node.classList.add('drag-source')
    navigator.vibrate?.(8)
  }

  const move = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (!ghost) {
      if (start.type === 'touch') {
        if (!armed) {
          if (Math.hypot(dx, dy) > 8) cancel() // user is scrolling
          return
        }
      } else if (Math.hypot(dx, dy) < 5) return
      begin(start.x, start.y)
    }
    const g = ghost!
    g.style.transform = `translate(${dx}px, ${dy}px)`
    const t = targetAt(e.clientX, e.clientY)
    if (t !== hover) {
      hover?.classList.remove('drop-hover')
      t?.classList.add('drop-hover')
      hover = t
    }
  }

  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return
    if (ghost) {
      suppressClick = true
      const t = targetAt(e.clientX, e.clientY)
      if (t) zones.get(t)?.(o.payload)
    }
    cancel()
  }

  const blockScroll = (e: TouchEvent) => {
    if (ghost || armed) e.preventDefault()
  }

  function cancel() {
    clearTimeout(holdTimer)
    ghost?.remove()
    ghost = null
    hover?.classList.remove('drop-hover')
    hover = null
    armed = false
    start = null
    node.classList.remove('drag-source', 'drag-armed')
    document.body.classList.remove('dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
  }

  const down = (e: PointerEvent) => {
    if (o.disabled || e.button !== 0) return
    if ((e.target as Element).closest('[data-nodrag]')) return
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType }
    if (e.pointerType === 'touch') {
      holdTimer = setTimeout(() => {
        armed = true
        node.classList.add('drag-armed')
        navigator.vibrate?.(8)
      }, 170)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const click = (e: MouseEvent) => {
    if (suppressClick) {
      e.stopImmediatePropagation()
      e.preventDefault()
      suppressClick = false
    }
  }

  const ctx = (e: Event) => armed && e.preventDefault() // no long-press menu

  node.addEventListener('pointerdown', down)
  node.addEventListener('click', click, true)
  node.addEventListener('touchmove', blockScroll, { passive: false })
  node.addEventListener('contextmenu', ctx)
  return {
    update(next: typeof opts) {
      o = next
    },
    destroy() {
      cancel()
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('click', click, true)
      node.removeEventListener('touchmove', blockScroll)
      node.removeEventListener('contextmenu', ctx)
    },
  }
}
