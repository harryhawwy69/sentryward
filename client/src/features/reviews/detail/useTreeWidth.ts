import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react"
import { TREE_DEFAULT_PX, clampTreeWidth, draggedTreeWidth, maxTreeWidth, readTreeWidth, saveTreeWidth, stepTreeWidth } from "./treeWidth"

/**
 * Width of the review file tree: starts from the saved value, follows a drag or
 * an arrow key, and persists every change. Nothing here depends on the width
 * being visible, so the hook is inert below `lg`.
 */
export function useTreeWidth() {
  const [width, setWidth] = useState(readTreeWidth)

  useEffect(() => {
    saveTreeWidth(width)
  }, [width])

  // A viewport that shrinks below the saved maximum must not leave the tree
  // wider than its bound.
  useEffect(() => {
    const onResize = () => setWidth((current) => clampTreeWidth(current, window.innerWidth))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = width
    handle.setPointerCapture?.(event.pointerId)
    const move = (moveEvent: PointerEvent) => setWidth(draggedTreeWidth(startWidth, startX, moveEvent.clientX, window.innerWidth))
    const stop = () => {
      handle.releasePointerCapture?.(event.pointerId)
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", stop)
      handle.removeEventListener("pointercancel", stop)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", stop)
    handle.addEventListener("pointercancel", stop)
  }, [width])

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      const direction = event.key === "ArrowLeft" ? -1 : 1
      setWidth((current) => stepTreeWidth(current, direction, window.innerWidth, event.shiftKey))
    } else if (event.key === "Home") {
      event.preventDefault()
      setWidth(clampTreeWidth(0, window.innerWidth))
    } else if (event.key === "End") {
      event.preventDefault()
      setWidth(maxTreeWidth(window.innerWidth))
    }
  }, [])

  const reset = useCallback(() => setWidth(TREE_DEFAULT_PX), [])

  return { width, setWidth, startDrag, onKeyDown, reset }
}
