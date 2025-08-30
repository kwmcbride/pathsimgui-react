import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Block from '../../Block/Block'
import ContextMenu from '../ContextMenu/ContextMenu'
import styles from './Canvas.module.css'
import { throttle } from '../../../utilities/throttle'
import { snapToGrid, GRID_SIZE } from '../../../utilities/grid'
// import { BlockConfigManager } from '../../../lib/BlockConfigManager';
// import blockConfigManager from '../../../lib/BlockConfigManager';   
// import { testValue } from '../../../lib/test'
// console.log('Test import:', testValue)
import blockConfigManager from '../../../lib/BlockConfigManager'

// Add these type definitions
interface BlockData {
    id: string
    blockType: string
    position: {
        x: number
        y: number
        width: number
        height: number
    }
    parameters: any[]
}

interface ContextMenuState {
    visible: boolean
    x: number
    y: number
    blockId: string | null
}

interface Position {
    x: number
    y: number
    width: number
    height: number
}

export default function Canvas() {

    // State for blocks on the canvas
    const [blocks, setBlocks] = useState<BlockData[]>([
        // Add some test blocks to start with
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
    ])
    
    // Selection state
    const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set())
    // Context menu state
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        blockId: null
    })
    
    // Selection box state
    const [selectionBox, setSelectionBox] = useState<{
        isActive: boolean
        startX: number
        startY: number
        currentX: number
        currentY: number
    }>({
        isActive: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0
    })

    // Dragging state
    const [isAnyBlockDragging, setIsAnyBlockDragging] = useState(false)
    // Group of blocks being copied
    const [dragCopyGroup, setDragCopyGroup] = useState<Set<string> | null>(null)
    // IDs of ghost blocks (for duplication preview) - change label of block before ghost
    const [ghostBlockIds, setGhostBlockIds] = useState<Set<string>>(new Set());
    // Ghost copies during drag-copy operation
    const [dragGhosts, setDragGhosts] = useState<BlockData[] | null>(null);
    // Track if configs are loaded
    const [configsLoaded, setConfigsLoaded] = useState(false);

    // Refs for mouse handling
    const canvasRef = useRef<SVGSVGElement>(null)
    // Ref to track if selection box is being dragged
    const isSelectionDragging = useRef(false)

    // Memoized array of selected block IDs for stable reference
    const selectedBlocksArray = useMemo(() => Array.from(selectedBlocks), [selectedBlocks]);


    // Load configs on startup
    useEffect(() => {
        async function loadConfigs() {
            try {
                await blockConfigManager.initialize()
                setConfigsLoaded(true)
            } catch (error) {
                console.error('Failed to load block configurations:', error)
                setConfigsLoaded(true) // Still render with fallback configs
            }
        }
        loadConfigs()
    }, [])

    // Handle starting a group drag-copy operation
    const handleStartGroupDragCopy = useCallback((blockIds: string[], startPoint: { x: number, y: number }) => {
        // Create ghost copies at the start positions
        const ghosts = blockIds.map(blockId => {
            const block = blocks.find(b => b.id === blockId);
            return block ? { ...block, id: `ghost_${block.id}` } : null;
        }).filter(Boolean) as BlockData[];
        setDragGhosts(ghosts);
    }, [blocks]);

      
    /**
     * Convert screen coordinates to SVG coordinates
     */
    const getSVGMousePosition = useCallback((e: MouseEvent | React.MouseEvent) => {
        if (!canvasRef.current) return { x: 0, y: 0 }
        
        const svg = canvasRef.current
        const rect = svg.getBoundingClientRect()
        const viewBox = svg.viewBox.baseVal
        
        const scaleX = viewBox.width / rect.width
        const scaleY = viewBox.height / rect.height
        
        return {
            x: (e.clientX - rect.left) * scaleX + viewBox.x,
            y: (e.clientY - rect.top) * scaleY + viewBox.y
        }
    }, [])

    /**
     * Handle canvas mouse down for selection box
     */
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return // Only left click
        
        const target = e.target as SVGElement
        // Check if we clicked on canvas background (not a block)
        if (target.tagName === 'rect' && target.getAttribute('fill') === '#d1d1d1ff') {
            e.preventDefault()
            
            // Clear existing selections
            setSelectedBlocks(new Set())
            
            // Start selection box
            const svgPoint = getSVGMousePosition(e)
            const startPoint = { x: svgPoint.x, y: svgPoint.y } // Store start point
            
            setSelectionBox({
                isActive: true,
                startX: svgPoint.x,
                startY: svgPoint.y,
                currentX: svgPoint.x,
                currentY: svgPoint.y
            })
            isSelectionDragging.current = true
            
            const handleMouseMove = (e: MouseEvent) => {
                if (!isSelectionDragging.current) return
                
                const currentPoint = getSVGMousePosition(e)
                setSelectionBox(prev => ({
                    ...prev,
                    currentX: currentPoint.x,
                    currentY: currentPoint.y
                }))
                
                // Calculate selection area using the stored start point
                const minX = Math.min(startPoint.x, currentPoint.x)
                const maxX = Math.max(startPoint.x, currentPoint.x)
                const minY = Math.min(startPoint.y, currentPoint.y)
                const maxY = Math.max(startPoint.y, currentPoint.y)
                
                // Find blocks within selection area
                const selectedBlockIds = new Set<string>()
                blocks.forEach(block => {
                    const blockLeft = block.position.x
                    const blockRight = block.position.x + block.position.width
                    const blockTop = block.position.y
                    const blockBottom = block.position.y + block.position.height
                    
                    // Check if block overlaps with selection area
                    if (blockLeft < maxX && blockRight > minX && 
                        blockTop < maxY && blockBottom > minY) {
                        selectedBlockIds.add(block.id)
                    }
                })
                
                setSelectedBlocks(selectedBlockIds)
            }
            
            const handleMouseUp = () => {
                isSelectionDragging.current = false
                setSelectionBox(prev => ({ ...prev, isActive: false }))
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }
            
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        }
    }, [getSVGMousePosition, blocks])

    useEffect(() => {
        const handleMouseUp = () => {
            setGhostBlockIds(new Set());
        };
        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, []);

    /**
     * Handle block selection
     */
    const handleBlockSelect = useCallback((blockId: string, isSelected: boolean, multiSelect: boolean = false) => {
        setSelectedBlocks(prev => {
            const newSelected = new Set(prev)
            
            if (multiSelect) {
                // Add/remove from selection
                if (isSelected) {
                    newSelected.add(blockId)
                } else {
                    newSelected.delete(blockId)
                }
            } else {
                // Single selection
                newSelected.clear()
                if (isSelected) {
                    newSelected.add(blockId)
                }
            }
            
            return newSelected
        })
    }, [])

    // Add ref to track current selection
    const selectedBlocksRef = useRef<Set<string>>(new Set())

    const handleDragStart = useCallback(() => {
        setIsAnyBlockDragging(true)
    }, [])

    const handleDragEnd = useCallback(() => {
        setIsAnyBlockDragging(false)
        setGhostBlockIds(new Set()) // Clear all ghost blocks when drag ends
    }, [])

    
    // Update the ref whenever selectedBlocks changes
    useEffect(() => {
        selectedBlocksRef.current = selectedBlocks
    }, [selectedBlocks])

    /**
     * Handle block position changes (dragging/resizing)
     */
    const handleBlockPositionChange = useCallback((blockId: string, newPosition: Position) => {
        setBlocks(prev => {
            const block = prev.find(b => b.id === blockId)
            if (!block) return prev

            const isResize =
                newPosition.width !== block.position.width ||
                newPosition.height !== block.position.height

            // If this is a resize, ONLY update the resized block.
            // (Previous logic treated any x/y change as a drag and propagated delta to the group.)
            if (isResize) {
                // No actual change
                if (
                    block.position.x === newPosition.x &&
                    block.position.y === newPosition.y &&
                    block.position.width === newPosition.width &&
                    block.position.height === newPosition.height
                ) return prev

                return prev.map(b =>
                    b.id === blockId
                        ? {
                            ...b,
                            position: {
                                x: snapToGrid(newPosition.x, GRID_SIZE),
                                y: snapToGrid(newPosition.y, GRID_SIZE),
                                width: snapToGrid(newPosition.width, GRID_SIZE),
                                height: snapToGrid(newPosition.height, GRID_SIZE)
                            }
                        }
                        : b
                )
            }

            // Drag logic (no size change)
            const deltaX = newPosition.x - block.position.x
            const deltaY = newPosition.y - block.position.y
            if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return prev

            return prev.map(b => {
                if (b.id === blockId) {
                    return {
                        ...b,
                        position: {
                            ...b.position,
                            x: snapToGrid(newPosition.x, GRID_SIZE),
                            y: snapToGrid(newPosition.y, GRID_SIZE)
                        }
                    }
                } else if (selectedBlocks.has(b.id) && selectedBlocks.size > 1) {
                    return {
                        ...b,
                        position: {
                            ...b.position,
                            x: snapToGrid(b.position.x + deltaX, GRID_SIZE),
                            y: snapToGrid(b.position.y + deltaY, GRID_SIZE)
                        }
                    }
                }
                return b
            })
        })
    }, [selectedBlocks])

   
    /**
     * Handle parameter changes
     */
    const handleBlockParameterChange = useCallback((blockId: string, newParameters: any[]) => {
        setBlocks(prevBlocks => 
            prevBlocks.map(block => {
                if (block.id === blockId) {
                    return {
                        ...block,
                        parameters: newParameters
                    }
                }
                return block
            })
        )
    }, [])

    /**
     * Handle right-click context menu on blocks OR duplicate creation
     */
    // Add a mouse up handler to the document when drag-copy starts
    const handleBlockContextMenu = useCallback((blockIdOrAction: string, deltaX: number, deltaY: number, anchorId?: string) => {
        // Handle duplication (single or group)
        if (blockIdOrAction.startsWith('duplicate:')) {
            const [, originalId, type] = blockIdOrAction.split(':');

            // GROUP DUPLICATION
            if (type === 'group' && selectedBlocks.size > 1 && selectedBlocks.has(originalId)) {
                const newBlocks: BlockData[] = [];
                const newBlockIds: string[] = [];
                
                const anchorBlock = blocks.find(b => b.id === anchorId || originalId);

                selectedBlocks.forEach(blockId => {
                    const originalBlock = blocks.find(b => b.id === blockId);
                    if (originalBlock && anchorBlock) {
                        // Calculate offset from anchor block
                        const offsetX = originalBlock.position.x - anchorBlock.position.x;
                        const offsetY = originalBlock.position.y - anchorBlock.position.y;
                        const newBlockId = `${originalBlock.blockType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        newBlockIds.push(newBlockId);
                        newBlocks.push({
                            ...originalBlock,
                            id: newBlockId,
                            position: {
                                ...originalBlock.position,
                                x: snapToGrid(anchorBlock.position.x + deltaX + offsetX, GRID_SIZE),
                                y: snapToGrid(anchorBlock.position.y + deltaY + offsetY, GRID_SIZE)
                            }
                        });
                    }
                });

                setBlocks(prev => [...prev, ...newBlocks]);
                setGhostBlockIds(new Set(newBlockIds));
                setSelectedBlocks(new Set(newBlockIds));
                requestAnimationFrame(() => {
                    setGhostBlockIds(new Set());
                });
                return;
            
            }

            // SINGLE BLOCK DUPLICATION
            const originalBlock = blocks.find(block => block.id === originalId);
            if (originalBlock) {
                const newBlockId = `${originalBlock.blockType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newBlock: BlockData = {
                    ...originalBlock,
                    id: newBlockId,
                    position: {
                        x: snapToGrid(originalBlock.position.x + deltaX, GRID_SIZE),
                        y: snapToGrid(originalBlock.position.y + deltaY, GRID_SIZE),
                        width: originalBlock.position.width,
                        height: originalBlock.position.height
                    }
                };
                setBlocks(prev => [...prev, newBlock]);
                setGhostBlockIds(new Set([newBlockId]));
                setSelectedBlocks(new Set([newBlockId]));

                requestAnimationFrame(() => {
                    setGhostBlockIds(new Set());
                });
            }
            return;
        }

    // Regular context menu (not duplication)
    setGhostBlockIds(new Set());
        setContextMenu({
            visible: true,
            x,
            y,
            blockId: blockIdOrAction
        });
    }, [blocks, selectedBlocks]);

// const handleDragEnd = useCallback(() => {
//     setIsAnyBlockDragging(false)
//     setGhostBlockIds(new Set()) // Clear all ghost blocks when drag ends
// }, [])

    // Close context menu when clicking elsewhere
    const closeContextMenu = useCallback(() => {
        setContextMenu(prev => ({ ...prev, visible: false }))
    }, [])

    /**
     * Delete selected blocks or specific block
     */
    const deleteBlock = useCallback((blockId?: string) => {
        if (blockId) {
            // Delete specific block
            setBlocks(prev => prev.filter(block => block.id !== blockId))
            setSelectedBlocks(prev => {
                const newSelected = new Set(prev)
                newSelected.delete(blockId)
                return newSelected
            })
        } else {
            // Delete all selected blocks
            setBlocks(prev => prev.filter(block => !selectedBlocks.has(block.id)))
            setSelectedBlocks(new Set())
        }
        closeContextMenu()
    }, [selectedBlocks, closeContextMenu])

    /**
     * Duplicate a specific block
     */
    const duplicateBlock = useCallback((blockId: string) => {
        const blockToDuplicate = blocks.find(block => block.id === blockId)
        if (blockToDuplicate) {
            const newId = `${blockToDuplicate.blockType}_${Date.now()}`
            const newBlock: BlockData = {
                id: newId,
                blockType: blockToDuplicate.blockType,
                position: {
                    x: blockToDuplicate.position.x + 50, // Offset the duplicate
                    y: blockToDuplicate.position.y + 50,
                    width: blockToDuplicate.position.width,
                    height: blockToDuplicate.position.height
                },
                parameters: [...blockToDuplicate.parameters]
            }
            setBlocks(prev => [...prev, newBlock])
        }
        closeContextMenu()
    }, [blocks, closeContextMenu])

    /**
     * Show properties dialog for a block
     */
    const showBlockProperties = useCallback((blockId: string) => {
        const block = blocks.find(b => b.id === blockId)
        if (block) {
            console.log('Opening properties for block:', block)
            // TODO: Implement properties dialog
            alert(`Properties for ${block.blockType} (${blockId})`)
        }
        closeContextMenu()
    }, [blocks, closeContextMenu])

    
    // Update context menu items to use these functions
    const contextMenuItems = [
        { 
            label: 'Delete Block', 
            action: () => contextMenu.blockId && deleteBlock(contextMenu.blockId)
        },
        { 
            label: 'Duplicate Block', 
            action: () => contextMenu.blockId && duplicateBlock(contextMenu.blockId)
        },
        { 
            label: 'Properties', 
            action: () => contextMenu.blockId && showBlockProperties(contextMenu.blockId)
        }
    ]   

    // Update the key function to be stable during drag operations
    // const getAdaptiveKey = useCallback((block: BlockData) => {
    //     if (isAnyBlockDragging) {
    //         // During drag/resize, use only block ID for stability
    //         return block.id
    //     } else {
    //         // When not dragging, use grid-snapped key for proper positioning
    //         const snappedX = snapToGrid(block.position.x, GRID_SIZE)
    //         const snappedY = snapToGrid(block.position.y, GRID_SIZE)
    //         return `${block.id}-${snappedX}-${snappedY}`
    //     }
    // }, [isAnyBlockDragging])

    const getStableKey = useCallback((block: BlockData) => {
        // Use position only when NOT dragging to prevent flicker
        // During drag, React will re-render based on state changes anyway
        if (isAnyBlockDragging) {
            return block.id
        }
        
        // When not dragging, include position for proper updates
        return `${block.id}-${block.position.x}-${block.position.y}`
    }, [isAnyBlockDragging])




    const renderGrid = useCallback(() => {
        const lines = []
        const viewBox = { width: 2400, height: 1600 } // From your SVG viewBox
        
        // Vertical lines
        for (let x = 0; x <= viewBox.width; x += GRID_SIZE) {
            lines.push(
                <line
                    key={`v-${x}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={viewBox.height}
                    stroke="rgba(0,0,0,0.1)"
                    strokeWidth="0.5"
                />
            )
        }
        
        // Horizontal lines
        for (let y = 0; y <= viewBox.height; y += GRID_SIZE) {
            lines.push(
                <line
                    key={`h-${y}`}
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
                    userSelect: 'none',           // Prevent text selection
                    WebkitUserSelect: 'none',     // Safari
                    MozUserSelect: 'none',        // Firefox
                    msUserSelect: 'none',         // IE/Edge
                    cursor: 'default'             // Ensure default cursor
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
                
                {/* Selection box */}
                {selectionBox.isActive && (
                    <rect
                        x={Math.min(selectionBox.startX, selectionBox.currentX)}
                        y={Math.min(selectionBox.startY, selectionBox.currentY)}
                        width={Math.abs(selectionBox.currentX - selectionBox.startX)}
                        height={Math.abs(selectionBox.currentY - selectionBox.startY)}
                        fill="rgba(0, 100, 255, 0.1)"
                        stroke="rgba(0, 100, 255, 0.5)"
                        strokeWidth="1"
                        strokeDasharray="3,3"
                    />
                )}
                
                {/* Render all blocks */}
                {blocks.map(block => (
                    <Block
                        key={block.id}
                        id={block.id}
                        blockType={block.blockType}
                        position={block.position}
                        parameters={block.parameters}
                        selected={selectedBlocks.has(block.id)}
                        ghost={ghostBlockIds.has(block.id)} // Fix: was "gghost"
                        selectedBlocks={selectedBlocksArray}
                        onStartGroupDragCopy={handleStartGroupDragCopy}
                        onParameterChange={handleBlockParameterChange}
                        onPositionChange={handleBlockPositionChange}
                        onContextMenu={handleBlockContextMenu}
                        onSelect={handleBlockSelect}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    />
                ))}
                
                <text 
                    x="600" 
                    y="400" 
                    textAnchor="middle" 
                    fontSize="48" 
                    fill="#333"
                    style={{ 
                        userSelect: 'none', 
                        pointerEvents: 'none'  // This is key - makes text non-interactive
                    }}
                >
                    Canvas Component
                </text>
                <text 
                    x="600" 
                    y="500" 
                    textAnchor="middle" 
                    fontSize="24" 
                    fill="#666"
                    style={{ 
                        userSelect: 'none', 
                        pointerEvents: 'none'  // This is key - makes text non-interactive
                    }}
                >
                    {blocks.length} blocks on canvas ({selectedBlocks.size} selected)
                </text>
            </svg>

            {/* Context Menu */}
            {contextMenu.visible && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenuItems}
                    onClose={closeContextMenu}
                    visible={contextMenu.visible}
                />
            )}
        </>
    )
}

