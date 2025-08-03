import React, { useState, useCallback } from 'react'
import Block from '../Block/Block'
import ContextMenu from '../interface/ContextMenu/ContextMenu'
import styles from './Canvas.module.css'

interface BlockData {
    id: string
    blockType: string
    position: {
        x: number
        y: number
        width: number
        height: number
    }
    parameters: Array<{
        name: string
        value: string | number | boolean
        type: 'string' | 'number' | 'boolean'
        description?: string
    }>
}

// Create a memoized Block component
// const MemoizedBlock = memo(Block)

export default function Canvas() {
    // Dynamic blocks state - initially just our test blocks
    const [blocks, setBlocks] = useState<BlockData[]>([
        {
            id: 'constant',
            blockType: 'Constant',
            position: { x: 50, y: 50, width: 80, height: 40 },
            parameters: [
                { name: 'value', value: 1, type: 'number', description: 'Constant value' }
            ]
        },
        {
            id: 'gain',
            blockType: 'Gain', 
            position: { x: 200, y: 100, width: 60, height: 40 },
            parameters: [
                { name: 'gain', value: 1.0, type: 'number', description: 'Gain value' }
            ]
        }
    ])

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
        visible: boolean
        x: number
        y: number
        blockId: string | null
    }>({
        visible: false,
        x: 0,
        y: 0,
        blockId: null
    })

    /**
     * Handle parameter changes from blocks, including position/size updates
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
     * Handle position/size changes from blocks
     */
    const handleBlockPositionChange = useCallback((blockId: string, newPosition: { x: number, y: number, width: number, height: number }) => {
        setBlocks(prevBlocks => 
            prevBlocks.map(block => {
                if (block.id === blockId) {
                    return {
                        ...block,
                        position: newPosition
                    }
                }
                return block
            })
        )
    }, [])

    /**
     * Add a new block to the canvas
     */
    const addBlock = useCallback((blockType: string, x: number = 100, y: number = 100) => {
        const newBlock: BlockData = {
            id: `${blockType.toLowerCase()}_${Date.now()}`,
            blockType,
            position: { x, y, width: 80, height: 40 }, // Default size, will be updated by block
            parameters: [] // Will be populated with defaults by the Block component
        }
        
        setBlocks(prev => [...prev, newBlock])
    }, [])

    /**
     * Remove a block from the canvas
     */
    const removeBlock = useCallback((blockId: string) => {
        setBlocks(prev => prev.filter(block => block.id !== blockId))
    }, [])

    /**
     * Handle canvas right-click (when not clicking on a block)
     */
    const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault() // Always prevent browser context menu
    }, [])

    /**
     * Close context menu
     */
    const closeContextMenu = useCallback(() => {
        setContextMenu(prev => ({ ...prev, visible: false }))
    }, [])

    /**
     * Duplicate a block
     */
    const duplicateBlock = useCallback((blockId: string) => {
        const blockToDuplicate = blocks.find(block => block.id === blockId)
        if (!blockToDuplicate) return

        const newBlock: BlockData = {
            id: `${blockToDuplicate.blockType.toLowerCase()}_${Date.now()}`,
            blockType: blockToDuplicate.blockType,
            position: {
                x: blockToDuplicate.position.x + 50, // Offset the duplicate
                y: blockToDuplicate.position.y + 50,
                width: blockToDuplicate.position.width,
                height: blockToDuplicate.position.height
            },
            parameters: [...blockToDuplicate.parameters] // Deep copy parameters
        }
        
        setBlocks(prev => [...prev, newBlock])
    }, [blocks])

    /**
     * Delete a block
     */
    const deleteBlock = useCallback((blockId: string) => {
        setBlocks(prev => prev.filter(block => block.id !== blockId))
    }, [])

    /**
     * Handle canvas right-click (when not clicking on a block)
     */
    // const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    //     // Only prevent default if we're not over a block
    //     // Block context menu events will be handled by the Block component
    //     if ((e.target as SVGElement).tagName === 'rect' && (e.target as SVGElement).getAttribute('fill') === '#d1d1d1ff') {
    //         e.preventDefault()
    //         // Could show canvas-level context menu here in the future
    //     }
    // }, [])

  /**
 * Handle right-click context menu on blocks OR duplicate creation
 */
const handleBlockContextMenu = useCallback((blockIdOrAction: string, x: number, y: number) => {
    // Check if this is a duplicate action
    if (blockIdOrAction.startsWith('duplicate:')) {
        const [, originalId, newId] = blockIdOrAction.split(':')
        
        setBlocks(prevBlocks => {
            const originalBlock = prevBlocks.find(block => block.id === originalId)
            
            if (originalBlock) {
                const newBlock: BlockData = {
                    id: newId,
                    blockType: originalBlock.blockType,
                    position: {
                        x: x - originalBlock.position.width / 2,
                        y: y - originalBlock.position.height / 2,
                        width: originalBlock.position.width,
                        height: originalBlock.position.height
                    },
                    parameters: [...originalBlock.parameters]
                }
                
                return [...prevBlocks, newBlock]
            }
            return prevBlocks
        })
    } else {
        // Regular context menu
        setContextMenu({
            visible: true,
            x,
            y,
            blockId: blockIdOrAction
        })
    }
}, []) // Remove blocks dependency

    /**
     * Handle clicks on canvas (close context menu)
     */
    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        // Close context menu if clicking on canvas
        if (contextMenu.visible) {
            closeContextMenu()
        }
    }, [contextMenu.visible, closeContextMenu])

    // Context menu items
    const contextMenuItems = [
        {
            label: 'Duplicate',
            action: () => contextMenu.blockId && duplicateBlock(contextMenu.blockId)
        },
        {
            label: 'Delete',
            action: () => contextMenu.blockId && deleteBlock(contextMenu.blockId)
        },
        {
            separator: true
        },
        {
            label: 'Properties',
            action: () => {
                // This could open a properties dialog
                console.log('Properties clicked for block:', contextMenu.blockId)
            }
        }
    ]

    return (
        <>
            <svg 
                id="blockCanvas" 
                className={styles.canvasContainer} 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 2400 1600"
                onContextMenu={handleCanvasContextMenu}
                onClick={handleCanvasClick}
            >
                <rect x="0" y="0" width="100%" height="100%" fill="#d1d1d1ff"/>
                
                {/* Render all blocks dynamically */}
                {blocks.map(block => (
                    <Block
                        key={block.id}
                        id={block.id}
                        blockType={block.blockType}
                        position={block.position}
                        parameters={block.parameters}
                        onParameterChange={handleBlockParameterChange}
                        onPositionChange={handleBlockPositionChange}
                        onContextMenu={handleBlockContextMenu}
                    />
                ))}
                
                <text x="600" y="400" textAnchor="middle" fontSize="48" fill="#333">
                    Canvas Component
                </text>
                <text x="600" y="500" textAnchor="middle" fontSize="24" fill="#666">
                    {blocks.length} blocks on canvas
                </text>
            </svg>

            {/* Context Menu */}
            <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                items={contextMenuItems}
                onClose={closeContextMenu}
                visible={contextMenu.visible}
            />
        </>
    )
}