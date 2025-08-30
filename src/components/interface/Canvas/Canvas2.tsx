//// filepath: /Users/kevinmcbride/Documents/Development/pathSimGui/pathsimgui-react/src/components/interface/Canvas/Canvas.tsx
import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useMemo
} from 'react'
import Block from '../../Block/Block'
import ContextMenu from '../ContextMenu/ContextMenu'
import styles from './Canvas.module.css'
import { snapToGrid, GRID_SIZE } from '../../../utilities/grid'
import blockConfigManager from '../../../lib/BlockConfigManager'

/**
 * BlockData describes a block's properties on the canvas.
 * @typedef {Object} BlockData
 * @property {string} id - Unique identifier for the block.
 * @property {string} blockType - Type of block (e.g., 'gain', 'constant').
 * @property {Object} position - Position and size of the block.
 * @property {number} position.x - X coordinate.
 * @property {number} position.y - Y Coordinate.
 * @property {number} position.width - Width of the block.
 * @property {number} position.height - Height of the block.
 * @property {any[]} parameters - Parameters for the block.
 */
interface BlockData {
  id: string
  blockType: string
  position: { x: number; y: number; width: number; height: number }
  parameters: any[]
}

/**
 * Position describes the coordinates and size of a block.
 */
interface Position {
  x: number
  y: number
  width: number
  height: number
}

/**
 * SelectionBox describes the selection rectangle drawn by the user.
 */
interface SelectionBox {
  isActive: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
}

/**
 * ContextMenuState describes the state of the context menu.
 */
interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  blockId: string | null
}

/**
 * CanvasState describes the entire state of the canvas.
 */
interface CanvasState {
  blocks: BlockData[]
  selected: Set<string>
  selectionBox: SelectionBox
  contextMenu: ContextMenuState
  isDragging: boolean
  ghostIds: Set<string>
  dragGhosts: BlockData[] | null
  configsLoaded: boolean
}

/**
 * Action describes all possible actions for the canvas reducer.
 */
type Action =
  | { type: 'CONFIGS_LOADED' }
  | { type: 'BLOCK_POSITION_CHANGE'; id: string; pos: Position; groupDrag: boolean }
  | { type: 'BLOCK_PARAMETERS_UPDATE'; id: string; parameters: any[] }
  | { type: 'SELECT_TOGGLE'; id: string }
  | { type: 'SELECT_SET'; ids: string[] }
  | { type: 'SELECT_CLEAR' }
  | { type: 'DRAG_START' }
  | { type: 'DRAG_END' }
  | { type: 'SELECTION_BOX_START'; x: number; y: number }
  | { type: 'SELECTION_BOX_UPDATE'; x: number; y: number }
  | { type: 'SELECTION_BOX_END' }
  | { type: 'CONTEXT_MENU_SHOW'; x: number; y: number; blockId: string | null }
  | { type: 'CONTEXT_MENU_HIDE' }
  | { type: 'DUPLICATE_SINGLE'; originalId: string; dx: number; dy: number }
  | { type: 'DUPLICATE_GROUP'; anchorId: string; dx: number; dy: number }
  | { type: 'GHOST_SET'; ids: string[] }
  | { type: 'GHOST_CLEAR' }
  | { type: 'DELETE_BLOCK'; id: string }
  | { type: 'DELETE_SELECTED' }
  | { type: 'ADD_BLOCK'; block: Partial<BlockData> }
  | { type: 'RENAME_BLOCK'; oldId: string; newId: string }

/**
 * Snap a position to the grid for both coordinates and size.
 * @param {Position} p
 * @returns {Position}
 */
function snapRect(p: Position): Position {
  return {
    x: snapToGrid(p.x, GRID_SIZE),
    y: snapToGrid(p.y, GRID_SIZE),
    width: snapToGrid(p.width, GRID_SIZE),
    height: snapToGrid(p.height, GRID_SIZE)
  }
}

/**
 * Snap only the x and y coordinates to the grid.
 * @param {Position} p
 * @returns {Position}
 */
function snapXY(p: Position): Position {
  return {
    x: snapToGrid(p.x, GRID_SIZE),
    y: snapToGrid(p.y, GRID_SIZE),
    width: p.width,
    height: p.height
  }
}

/**
 * Initial state for the canvas reducer.
 */
const initialState: CanvasState = {
  blocks: [
    {
      id: 'block1',
      blockType: 'gain',
      position: { x: 100, y: 100, width: 120, height: 80 },
      parameters: []
    },
    {
      id: 'block2',
      blockType: 'constant',
      position: { x: 300, y: 200, width: 50, height: 50 },
      parameters: []
    }
  ],
  selected: new Set(),
  selectionBox: {
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  },
  contextMenu: { visible: false, x: 0, y: 0, blockId: null },
  isDragging: false,
  ghostIds: new Set(),
  dragGhosts: null,
  configsLoaded: false
}

/**
 * Reducer for managing canvas state.
 * Handles block movement, selection, duplication, deletion, and context menu.
 * @param {CanvasState} state
 * @param {Action} action
 * @returns {CanvasState}
 */
function reducer(state: CanvasState, action: Action): CanvasState {

  switch (action.type) {

    // Mark configs as loaded
    case 'CONFIGS_LOADED':
      return { ...state, configsLoaded: true }

    // Toggle selection for a block
    case 'SELECT_TOGGLE': {
      const next = new Set(state.selected)
      next.has(action.id) ? next.delete(action.id) : next.add(action.id)
      return { ...state, selected: next }
    }
    // Set selection to a specific set of block ids
    case 'SELECT_SET':
      return { ...state, selected: new Set(action.ids) }
    // Clear all selections
    case 'SELECT_CLEAR':
      return { ...state, selected: new Set() }

    // Start dragging blocks
    case 'DRAG_START':
      return { ...state, isDragging: true }
    // End dragging blocks and clear ghost ids
    case 'DRAG_END':
      return { ...state, isDragging: false, ghostIds: new Set() }

    // Start drawing selection box
    case 'SELECTION_BOX_START':
      return {
        ...state,
        selectionBox: {
          isActive: true,
          startX: action.x,
          startY: action.y,
          currentX: action.x,
          currentY: action.y
        },
        selected: new Set()
      }
    // Update selection box dimensions and update selection
    case 'SELECTION_BOX_UPDATE': {
      if (!state.selectionBox.isActive) return state
      const { startX, startY } = state.selectionBox
      const minX = Math.min(startX, action.x)
      const maxX = Math.max(startX, action.x)
      const minY = Math.min(startY, action.y)
      const maxY = Math.max(startY, action.y)
      const inside = state.blocks.filter(b => {
        const { x, y, width, height } = b.position
        return x < maxX && x + width > minX && y < maxY && y + height > minY
      }).map(b => b.id)
      return {
        ...state,
        selectionBox: { ...state.selectionBox, currentX: action.x, currentY: action.y },
        selected: new Set(inside)
      }
    }
    // End selection box drawing
    case 'SELECTION_BOX_END':
      return {
        ...state,
        selectionBox: { ...state.selectionBox, isActive: false }
      }

    // Change block position or resize, including group drag
    case 'BLOCK_POSITION_CHANGE': {

      const { id, pos, groupDrag } = action
      const current = state.blocks.find(b => b.id === id)
      if (!current) return state

      const isResize =
        pos.width !== current.position.width ||
        pos.height !== current.position.height

      let updatedBlocks: BlockData[]

      if (isResize) {
        // Only target block
        const snapped = snapRect(pos)
        if (
          current.position.x === snapped.x &&
          current.position.y === snapped.y &&
          current.position.width === snapped.width &&
          current.position.height === snapped.height
        ) return state
        updatedBlocks = state.blocks.map(b =>
          b.id === id ? { ...b, position: snapped } : b
        )
        return { ...state, blocks: updatedBlocks }
      }

      // Drag
      if (groupDrag && state.selected.size > 1) {
        const dx = pos.x - current.position.x
        const dy = pos.y - current.position.y
        if (dx === 0 && dy === 0) return state
        updatedBlocks = state.blocks.map(b => {
          if (b.id === id) {
            return { ...b, position: snapXY(pos) }
          }
          if (state.selected.has(b.id)) {
            return {
              ...b,
              position: {
                ...b.position,
                x: snapToGrid(b.position.x + dx, GRID_SIZE),
                y: snapToGrid(b.position.y + dy, GRID_SIZE)
              }
            }
          }
          return b
        })
        return { ...state, blocks: updatedBlocks }
      } else {
        const snapped = snapXY(pos)
        const c = current.position
        if (c.x === snapped.x && c.y === snapped.y) return state
        updatedBlocks = state.blocks.map(b =>
          b.id === id ? { ...b, position: snapped } : b
        )
        return { ...state, blocks: updatedBlocks }
      }
    }

    // Update block parameters
    case 'BLOCK_PARAMETERS_UPDATE':
      return {
        ...state,
        blocks: state.blocks.map(b =>
          b.id === action.id ? { ...b, parameters: action.parameters } : b
        )
      }

    // Show context menu at a position for a block
    case 'CONTEXT_MENU_SHOW':
      return {
        ...state,
        contextMenu: {
          visible: true,
          x: action.x,
          y: action.y,
          blockId: action.blockId
        }
      }
    // Hide context menu
    case 'CONTEXT_MENU_HIDE':
      return {
        ...state,
        contextMenu: { ...state.contextMenu, visible: false }
      }

    // Add a new block with smart naming
    case 'ADD_BLOCK': {
      const incoming = action.block
      if (!incoming.blockType) return state
      
      const base = displayBaseName(incoming.blockType)
      const existingNames = state.blocks.map(b => b.id)
      const newId = getNextAvailableName(base, existingNames)

      const newBlock: BlockData = {
        id: newId,
        blockType: incoming.blockType,
        position: incoming.position || { x: 50, y: 50, width: 100, height: 100 },
        parameters: incoming.parameters || []
      }

      return {
        ...state,
        blocks: [...state.blocks, newBlock]
      }
    }

    // Duplicate a single block
    case 'DUPLICATE_SINGLE': {
        const original = state.blocks.find(b => b.id === action.originalId)
        if (!original) return state
        
        // Use the original block's ID as the base, not the blockType
        const base = original.id
        const existingNames = state.blocks.map(b => b.id)
        const newId = getNextAvailableName(base, existingNames)
        
        const newBlock: BlockData = {
            ...original,
            id: newId,
            position: {
                ...original.position,
                x: snapToGrid(original.position.x + action.dx, GRID_SIZE),
                y: snapToGrid(original.position.y + action.dy, GRID_SIZE)
            }
        }
        return {
            ...state,
            blocks: [...state.blocks, newBlock],
            selected: new Set([newId]),
            ghostIds: new Set([newId])
        }
    }

    // Duplicate a group of selected blocks
    case 'DUPLICATE_GROUP': {
        if (!state.selected.has(action.anchorId)) return state
        const anchor = state.blocks.find(b => b.id === action.anchorId)
        if (!anchor) return state
        
        const newBlocks: BlockData[] = []
        const newIds: string[] = []
        
        // Get current existing names before we start adding
        let existingNames = state.blocks.map(b => b.id)
        
        state.selected.forEach(id => {
            const orig = state.blocks.find(b => b.id === id)
            if (!orig) return
            
            // Use the original block's current ID as the base, not blockType
            const base = orig.id
            const newId = getNextAvailableName(base, existingNames)
            
            // Add this new ID to existingNames for next iteration
            existingNames.push(newId)
            newIds.push(newId)
            
            const offsetX = orig.position.x - anchor.position.x
            const offsetY = orig.position.y - anchor.position.y
            
            newBlocks.push({
                ...orig,
                id: newId,
                position: {
                    ...orig.position,
                    x: snapToGrid(anchor.position.x + action.dx + offsetX, GRID_SIZE),
                    y: snapToGrid(anchor.position.y + action.dy + offsetY, GRID_SIZE)
                }
            })
        })
        
        return {
            ...state,
            blocks: [...state.blocks, ...newBlocks],
            selected: new Set(newIds),
            ghostIds: new Set(newIds)
        }
    }

    // Rename a block
    case 'RENAME_BLOCK': {
      const updatedBlocks = state.blocks.map(b => 
        b.id === action.oldId ? { ...b, id: action.newId } : b
      )
      
      const updatedSelected = new Set(
        Array.from(state.selected).map(id => 
          id === action.oldId ? action.newId : id
        )
      )
      
      return {
        ...state,
        blocks: updatedBlocks,
        selected: updatedSelected
      }
    }

    // Set ghost ids for blocks
    case 'GHOST_SET':
      return { ...state, ghostIds: new Set(action.ids) }
    // Clear ghost ids
    case 'GHOST_CLEAR':
      return { ...state, ghostIds: new Set() }

    // Delete a single block
    case 'DELETE_BLOCK': {
      const filtered = state.blocks.filter(b => b.id !== action.id)
      const nextSel = new Set(state.selected)
      nextSel.delete(action.id)
      return { ...state, blocks: filtered, selected: nextSel }
    }
    // Delete all selected blocks
    case 'DELETE_SELECTED':
      return {
        ...state,
        blocks: state.blocks.filter(b => !state.selected.has(b.id)),
        selected: new Set()
      }

    // Default: return unchanged state
    default:
      return state
  }
}

/**
 * Canvas component renders the block diagram editor.
 * Handles block rendering, selection, drag, duplication, context menu, and grid.
 * @component
 */
export default function Canvas() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const canvasRef = useRef<SVGSVGElement>(null)

  // Selection box refs
  const isSelectionDragging = useRef(false)
  const selectedBlocksArray = useMemo(
    () => Array.from(state.selected),
    [state.selected]
  )

  // Load block configs once on mount
  useEffect(() => {
    (async () => {
      try {
        await blockConfigManager.initialize()
      } catch {
        // ignore
      } finally {
        dispatch({ type: 'CONFIGS_LOADED' })
      }
    })()
  }, [])

  /**
   * Get mouse position relative to SVG canvas coordinates.
   * @param {MouseEvent|React.MouseEvent} e
   * @returns {{x: number, y: number}}
   */
  const getSVGMousePosition = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!canvasRef.current)
        return { x: 0, y: 0 }
      const svg = canvasRef.current
      const rect = svg.getBoundingClientRect()
      const viewBox = svg.viewBox.baseVal
      const scaleX = viewBox.width / rect.width
      const scaleY = viewBox.height / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX + viewBox.x,
        y: (e.clientY - rect.top) * scaleY + viewBox.y
      }
    },
    []
  )

  /**
   * Handle mouse down on canvas for selection box.
   * @param {React.MouseEvent} e
   */
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const tgt = e.target as SVGElement
      if (tgt.tagName === 'rect' && tgt.getAttribute('fill') === '#d1d1d1ff') {
        e.preventDefault()
        dispatch({ type: 'SELECT_CLEAR' })
        const p = getSVGMousePosition(e)
        dispatch({ type: 'SELECTION_BOX_START', x: p.x, y: p.y })
        isSelectionDragging.current = true

        const move = (me: MouseEvent) => {
          if (!isSelectionDragging.current) return
          const cp = getSVGMousePosition(me)
          dispatch({ type: 'SELECTION_BOX_UPDATE', x: cp.x, y: cp.y })
        }
        const up = () => {
          isSelectionDragging.current = false
          dispatch({ type: 'SELECTION_BOX_END' })
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
          document.removeEventListener('mouseleave', up)
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
        document.addEventListener('mouseleave', up)
      }
    },
    [getSVGMousePosition]
  )

  /** Start dragging blocks */
  const handleDragStart = useCallback(
    () => dispatch({ type: 'DRAG_START' }),
    []
  )
  /** End dragging blocks */
  const handleDragEnd = useCallback(
    () => dispatch({ type: 'DRAG_END' }),
    []
  )

  /**
   * Handle block selection.
   * @param {string} id
   * @param {boolean} isSelected
   * @param {boolean} multi
   */
  const handleBlockSelect = useCallback(
    (id: string, isSelected: boolean, multi: boolean) => {
      if (multi) {
        dispatch({ type: 'SELECT_TOGGLE', id })
      } else {
        dispatch({ type: 'SELECT_SET', ids: isSelected ? [id] : [] })
      }
    },
    []
  )

  /**
   * Handle block position or resize change.
   * @param {string} blockId
   * @param {Position} pos
   */
  const handleBlockPositionChange = useCallback(
    (blockId: string, pos: Position) => {
      const groupDrag =
        state.selected.size > 1 && state.selected.has(blockId)
      dispatch({
        type: 'BLOCK_POSITION_CHANGE',
        id: blockId,
        pos,
        groupDrag
      })
    },
    [state.selected]
  )

  /**
   * Handle block parameter change.
   * @param {string} id
   * @param {any[]} parameters
   */
  const handleBlockParameterChange = useCallback(
    (id: string, parameters: any[]) => {
      dispatch({ type: 'BLOCK_PARAMETERS_UPDATE', id, parameters })
    },
    []
  )

  /**
   * Handle context menu or duplication actions from Block.
   * @param {string} blockIdOrAction
   * @param {number} dx
   * @param {number} dy
   * @param {string} [anchorId]
   */
  const handleBlockContextMenu = useCallback(
    (blockIdOrAction: string, dx: number, dy: number, anchorId?: string) => {

      // If multiple blocks are selected and right-clicked block is in selection
      const isGroup = state.selected.size > 1 && state.selected.has(blockIdOrAction)

      if (blockIdOrAction.startsWith('duplicate:')) {
        const parts = blockIdOrAction.split(':')
        const originalId = parts[1]
        const type = parts[2]

        if (type === 'group' && anchorId) {
          dispatch({
            type: 'DUPLICATE_GROUP',
            anchorId,
            dx,
            dy
          })
          // schedule ghost clear
          requestAnimationFrame(() =>
            dispatch({ type: 'GHOST_CLEAR' })
          )
          return
        }

        // single
        dispatch({
          type: 'DUPLICATE_SINGLE',
          originalId,
          dx,
          dy
        })
        requestAnimationFrame(() =>
          dispatch({ type: 'GHOST_CLEAR' })
        )
        return
      }

      // Normal context menu (dx/dy hold screen coords here)
      dispatch({
        type: 'CONTEXT_MENU_SHOW',
        x: dx,
        y: dy,
        blockId: isGroup ? null : blockIdOrAction
      })
    },
    [state.selected]
  )

  /**
   * Delete a block or all selected blocks.
   * @param {string} [id]
   */
  const deleteBlock = useCallback(
    (id?: string) => {
      if (id) {
        dispatch({ type: 'DELETE_BLOCK', id })
      } else {
        dispatch({ type: 'DELETE_SELECTED' })
      }
      dispatch({ type: 'CONTEXT_MENU_HIDE' })
    },
    []
  )

  /**
   * Duplicate a block.
   * @param {string} id
   */
  const duplicateBlock = useCallback(
    (id: string) => {
      dispatch({
        type: 'DUPLICATE_SINGLE',
        originalId: id,
        dx: 50,
        dy: 50
      })
      requestAnimationFrame(() =>
        dispatch({ type: 'GHOST_CLEAR' })
      )
      dispatch({ type: 'CONTEXT_MENU_HIDE' })
    },
    []
  )

  /**
   * Show block properties (currently alerts).
   * @param {string} id
   */
  const showBlockProperties = useCallback(
    (id: string) => {
      const blk = state.blocks.find(b => b.id === id)
      if (blk) {
        alert(`Properties for ${blk.blockType} (${id})`)
      }
      dispatch({ type: 'CONTEXT_MENU_HIDE' })
    },
    [state.blocks]
  )

  /** Close context menu */
  const closeContextMenu = useCallback(
    () => dispatch({ type: 'CONTEXT_MENU_HIDE' }),
    []
  )

  /** Rename a block */
  const handleBlockRename = useCallback(
    (oldId: string, newId: string) => {
      dispatch({ type: 'RENAME_BLOCK', oldId, newId })
    },
    []
  )

  /**
   * Context menu items for blocks.
   */
  const singleBlockMenuItems = [
    { label: 'Delete Block', action: () => state.contextMenu.blockId && deleteBlock(state.contextMenu.blockId) },
    { label: 'Duplicate Block', action: () => state.contextMenu.blockId && duplicateBlock(state.contextMenu.blockId) },
    { label: 'Properties', action: () => state.contextMenu.blockId && showBlockProperties(state.contextMenu.blockId) }
  ]

  const groupMenuItems = [
    { label: 'Delete Selected Blocks', action: () => deleteBlock() },
    { label: 'Duplicate Group', action: () => {
        // Use anchor block for duplication (e.g., last right-clicked)
        const anchorId = selectedBlocksArray[0]
        dispatch({ type: 'DUPLICATE_GROUP', anchorId, dx: 50, dy: 50 })
        requestAnimationFrame(() => dispatch({ type: 'GHOST_CLEAR' }))
        dispatch({ type: 'CONTEXT_MENU_HIDE' })
      }
    },
    { label: 'Group Properties', action: () => alert(`Properties for ${state.selected.size} blocks`) }
  ]

  /**
   * Render grid lines for the canvas.
   * @returns {JSX.Element[]}
   */
  const renderGrid = useCallback(() => {
    const lines: JSX.Element[] = []
    const viewBox = { width: 2400, height: 1600 }
    for (let x = 0; x <= viewBox.width; x += GRID_SIZE) {
      lines.push(
        <line
          key={`vx-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={viewBox.height}
          stroke="rgba(0,0,0,0.1)"
          strokeWidth="0.5"
        />
      )
    }
    for (let y = 0; y <= viewBox.height; y += GRID_SIZE) {
      lines.push(
        <line
          key={`hy-${y}`}
          x1={0}
          y1={y}
          x2={viewBox.width}
          y2={y}
          stroke="rgba(0,0,0,0.1)"
          strokeWidth="0.5"
        />
      )
    }
    return lines
  }, [])

  return (
    <>
      <svg
        ref={canvasRef}
        id="blockCanvas"
        className={styles.canvasContainer}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 2400 1600"
        onMouseDown={handleCanvasMouseDown}
        onClick={closeContextMenu}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          cursor: 'default'
        }}
      >
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="#d1d1d1ff"
        />

        {renderGrid()}

        {state.selectionBox.isActive && (
          <rect
            x={Math.min(
              state.selectionBox.startX,
              state.selectionBox.currentX
            )}
            y={Math.min(
              state.selectionBox.startY,
              state.selectionBox.currentY
            )}
            width={Math.abs(
              state.selectionBox.currentX - state.selectionBox.startX
            )}
            height={Math.abs(
              state.selectionBox.currentY - state.selectionBox.startY
            )}
            fill="rgba(0,100,255,0.1)"
            stroke="rgba(0,100,255,0.5)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}

        {state.blocks.map(block => (
          <Block
            key={block.id}
            id={block.id}
            blockType={block.blockType}
            position={block.position}
            parameters={block.parameters}
            selected={state.selected.has(block.id)}
            ghost={state.ghostIds.has(block.id)}
            selectedBlocks={selectedBlocksArray}
            onStartGroupDragCopy={() => {}}
            onParameterChange={handleBlockParameterChange}
            onPositionChange={handleBlockPositionChange}
            onContextMenu={handleBlockContextMenu}
            onSelect={handleBlockSelect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            allBlocks={state.blocks} // Add this line
            onRename={handleBlockRename} // Add this line
          />
        ))}

        <text
          x="600"
          y="400"
          textAnchor="middle"
          fontSize="48"
          fill="#333"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          Canvas Component
        </text>
        <text
          x="600"
          y="500"
          textAnchor="middle"
          fontSize="24"
          fill="#666"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {state.blocks.length} blocks on canvas ({state.selected.size}{' '}
          selected)
        </text>
      </svg>

      {state.contextMenu.visible && (
        <ContextMenu
          x={state.contextMenu.x}
          y={state.contextMenu.y}
          items={state.contextMenu.blockId ? singleBlockMenuItems : groupMenuItems}
          onClose={closeContextMenu}
          visible={state.contextMenu.visible}
        />
      )}
    </>
  )
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function displayBaseName(blockType: string) {
    if (!blockType) return 'Block';
    return blockType.charAt(0).toUpperCase() + blockType.slice(1);
}

/**
 * Get the next available name for a base, reusing freed indices.
 * If the base already has a number, extract the base part for consistent numbering
 */
function getNextAvailableName(base: string, existingNames: string[]) {
    // Extract the actual base name if it already has a number
    // e.g. "value" stays "value", "value1" becomes "value", "Gain2" becomes "Gain"
    const match = base.match(/^(.+?)(\d+)?$/);
    const actualBase = match ? match[1] : base;
    
    const used = new Set<number>();
    const baseEsc = escapeRegExp(actualBase);
    const re = new RegExp(`^${baseEsc}(\\d+)?$`);
    
    for (const n of existingNames) {
        const m = String(n).match(re);
        if (!m) continue;
        if (!m[1]) used.add(0);
        else used.add(parseInt(m[1], 10));
    }
    
    for (let i = 0; ; i++) {
        if (!used.has(i)) return i === 0 ? actualBase : `${actualBase}${i}`;
    }
}