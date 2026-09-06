import { useCallback, useEffect, useRef } from 'react'

// A horizontally scrolling strip that says so.
//
// The `.scrollx` class hides the scrollbar (deliberately — a permanent grey
// bar across the tool row would be worse), but nothing replaced it, so eight
// places in the app could be scrolled sideways with no hint that they could:
// the box score simply cut a column off at the right edge and stopped.
//
// This is a drop-in for the plain `<div className="scrollx">` those places
// used — same single element, no wrapper — that measures its own overflow and
// records which sides have more content in a data attribute. index.css turns
// that into a soft fade, applied as a mask on the element's own box, so the
// fade sits at the edge while the content scrolls underneath it. The fade
// appears only while there is actually something beyond the edge, which is
// what makes it readable as "there is more" rather than as decoration.
export default function ScrollX({ children, className, ...rest }) {
  const ref = useRef(null)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // A tolerance, not a nicety: fractional layout widths mean scrollWidth is
    // routinely a fraction of a pixel over clientWidth with nothing to
    // scroll to, which would leave a fade permanently stuck to the edge.
    const max = el.scrollWidth - el.clientWidth
    const left = el.scrollLeft > 1
    const right = el.scrollLeft < max - 1
    const v = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none'
    if (el.dataset.more !== v) el.dataset.more = v
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // Content here is React-rendered and changes without any scroll or window
    // resize — a drill added, a team switched, a play saved — so the element
    // and its content both need watching, not just the viewport.
    let ro
    if (window.ResizeObserver) {
      ro = new ResizeObserver(measure)
      ro.observe(el)
      Array.from(el.children).forEach((c) => ro.observe(c))
    }
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      if (ro) ro.disconnect()
    }
  })

  return (
    <div {...rest} ref={ref} className={className ? 'scrollx ' + className : 'scrollx'}>
      {children}
    </div>
  )
}
