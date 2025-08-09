import React, { useState, useCallback, useEffect, useRef } from 'react'
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
    
    const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set())
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

    const [isAnyBlockDragging, setIsAnyBlockDragging] = useState(false)
    const [dragCopyGroup, setDragCopyGroup] = useState<Set<string> | null>(null)
    const [ghostBlockIds, setGhostBlockIds] = useState<Set<string>>(new Set());
    const [dragGhosts, setDragGhosts] = useState<BlockData[] | null>(null);

    const [configsLoaded, setConfigsLoaded] = useState(false);

    const canvasRef = useRef<SVGSVGElement>(null)
    const isSelectionDragging = useRef(false)

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

    // Show loading screen while configs load
    // if (!configsLoaded) {
    //     return (
    //         <div style={{ 
    //             padding: 40, 
    //             textAlign: 'center',
    //             fontFamily: 'monospace'
    //         }}>
    //             <h2>Loading Block Configurations...</h2>
    //         </div>
    //     )
    // }

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
     * Handle position changes - move all selected blocks together
     */
    // const handleBlockPositionChange = useCallback((blockId: string, newPosition: { x: number, y: number, width: number, height: number }) => {
    //     console.log('Canvas received position update:', blockId, newPosition);

    //     setBlocks(prevBlocks => {
    //         const blockBeingDragged = prevBlocks.find(block => block.id === blockId)
    //         if (!blockBeingDragged) return prevBlocks
            
    //         const snappedPosition = {
    //             ...newPosition,
    //             x: snapToGrid(newPosition.x, GRID_SIZE),
    //             y: snapToGrid(newPosition.y, GRID_SIZE)
    //         }

    //         const currentSelection = selectedBlocksRef.current
            
    //         // Calculate delta movement from the current position in state
    //         const deltaX = snappedPosition.x - blockBeingDragged.position.x
    //         const deltaY = snappedPosition.y - blockBeingDragged.position.y

    //         // NEW: Check for width/height changes too
    //         const widthChanged = snappedPosition.width !== blockBeingDragged.position.width
    //         const heightChanged = snappedPosition.height !== blockBeingDragged.position.height

    //         if (
    //             Math.abs(deltaX) < 0.1 &&
    //             Math.abs(deltaY) < 0.1 &&
    //             !widthChanged &&
    //             !heightChanged
    //         ) {
    //             return prevBlocks
    //         }
            
    //         // Apply movement to all blocks
    //         return prevBlocks.map(block => {
    //             if (block.id === blockId) {
    //                 // Update the dragged/resized block
    //                 return { ...block, position: snappedPosition }
    //             } else if (currentSelection.has(block.id) && currentSelection.size > 1) {
    //                 // Move other selected blocks by the same delta (do not resize them)
    //                 const newPos = {
    //                     ...block.position,
    //                     x: snapToGrid(block.position.x + deltaX, GRID_SIZE),
    //                     y: snapToGrid(block.position.y + deltaY, GRID_SIZE)
    //                 }

    //                 return {
    //                     ...block,
    //                     position: newPos
    //                 }
    //             }
    //             return block
    //         })
    //     })
    // }, [])
    const handleBlockPositionChange = useCallback((blockId: string, newPosition: Position) => {
        // IMPORTANT: Store the exact position that was passed in
        setBlocks(prev => prev.map(block => 
            block.id === blockId 
                ? { 
                    ...block, 
                    position: { 
                        // Use the EXACT values from newPosition, not snapped/modified values
                        x: newPosition.x,
                        y: newPosition.y,
                        width: newPosition.width,
                        height: newPosition.height
                    } 
                } 
                : block
        ))
    }, [])

   
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
            // const firstBlock = blocks.find(b => b.id === originalId);
            // if (!firstBlock) return;

            // const offsetX = snapToGrid(x - firstBlock.position.x, GRID_SIZE);
            // const offsetY = snapToGrid(y - firstBlock.position.y, GRID_SIZE);

            // selectedBlocks.forEach(blockId => {
            //     const originalBlock = blocks.find(b => b.id === blockId);
            //     if (originalBlock) {
            //         const newBlockId = `${originalBlock.blockType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            //         newBlockIds.push(newBlockId);
            //         newBlocks.push({
            //             ...originalBlock,
            //             id: newBlockId,
            //             position: {
            //                 ...originalBlock.position,
            //                 x: snapToGrid(originalBlock.position.x + offsetX, GRID_SIZE),
            //                 y: snapToGrid(originalBlock.position.y + offsetY, GRID_SIZE)
            //             }
            //         });
            //     }
            // });

            // setBlocks(prev => [...prev, ...newBlocks]);
            // setGhostBlockIds(new Set(newBlockIds)); // Ghost only the new blocks
            // console.log('Ghost block IDs set:', newBlockIds);
            // setSelectedBlocks(new Set(newBlockIds)); // Select the new blocks

            // // setTimeout(() => {
            // //     setGhostBlockIds(new Set());
            // //     console.log('Ghost block IDs cleared after duplication');
            // // }, 0);

            // requestAnimationFrame(() => {
            //     setGhostBlockIds(new Set());
            //     console.log('Ghost block IDs cleared after duplication');
            // });

            // // Remove ghosting on mouse up
            // const handleMouseUp = () => {
            //     setGhostBlockIds(new Set());
            //     document.removeEventListener('mouseup', handleMouseUp);
            // };
            // document.addEventListener('mouseup', handleMouseUp);
            // return;
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
                        key={getStableKey(block)}
                        id={block.id}
                        blockType={block.blockType}
                        position={block.position}
                        parameters={block.parameters}
                        selected={selectedBlocks.has(block.id)}
                        ghost={ghostBlockIds.has(block.id)} // Fix: was "gghost"
                        selectedBlocks={Array.from(selectedBlocks)}
                        onStartGroupDragCopy={handleStartGroupDragCopy}
                        onParameterChange={handleBlockParameterChange}
                        onPositionChange={handleBlockPositionChange}
                        onContextMenu={handleBlockContextMenu}
                        onSelect={handleBlockSelect}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    />
                ))}
                
                <text x="600" y="400" textAnchor="middle" fontSize="48" fill="#333">
                    Canvas Component
                </text>
                <text x="600" y="500" textAnchor="middle" fontSize="24" fill="#666">
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