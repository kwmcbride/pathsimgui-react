import React, { useState, useRef, useCallback, useEffect, memo, useMemo } from 'react'
import Port from '../Port/Port'
import Mask from '../Mask/Mask'
import { blockConfigManager, BlockConfiguration } from '../../lib/BlockConfigManager'
import { snapToGrid, GRID_SIZE } from '../../utilities/grid'

/**
 * Represents the position and size of a block on the canvas.
 */
interface Position {
    x: number
    y: number
    width: number
    height: number
}

/**
 * Represents a configurable parameter for a block.
 */
interface BlockParameter {
    name: string
    value: string | number | boolean
    type: 'string' | 'number' | 'boolean'
    description?: string
}

/**
 * Props for the Block component.
 */
interface BlockProps {
    id: string
    blockType: string
    position?: Partial<Position>
    isPreview?: boolean
    parameters?: BlockParameter[]
    selected?: boolean
    ghost?: boolean
    selectedBlocks?: string[]
    allBlocks?: any[]
    onParameterChange?: (blockId: string, parameters: BlockParameter[]) => void
    onPositionChange?: (blockId: string, position: Position) => void
    onGroupMove?: (deltas: Record<string, { deltaX: number, deltaY: number }>) => void // Add this
    onContextMenu?: (blockId: string, x: number, y: number) => void
    onSelect?: (blockId: string, isSelected: boolean, multiSelect?: boolean) => void
    onDragStart?: () => void
    onDragEnd?: () => void
}

/**
 * Styling configuration for a block.
 */
interface BlockStyle {
    fill: string
    stroke: string
    strokeWidth: number
    resizeCornerSize: number
    portSize: number
}



/**
 * Block component representing a draggable, configurable block on the canvas.
 * Handles rendering, selection, dragging, resizing, and parameter editing.
 */
function Block({
    id,
    blockType,
    position: initialPosition = {},
    isPreview = false,
    parameters = [],
    selected = false,
    ghost = false,
    selectedBlocks = [],
    allBlocks = [],
    onParameterChange,
    onPositionChange,
    onGroupMove,
    onContextMenu,
    onSelect,
    onDragStart,
    onDragEnd
}: BlockProps) {
    // State hooks, these need to be at the top
    
    // Block configuration loaded from JSON
    const [blockConfig, setBlockConfig] = useState<BlockConfiguration | null>(null)

// Replace lines 98-115 and 167-185 (consolidate into one useEffect)

    // useEffect(() => {
    //     const loadConfig = async () => {
    //         try {
    //             setLoading(true)
    //             const config = await blockConfigManager.loadBlockConfig(blockType)
    //             setBlockConfig(config)
                
    //             // If no parameters provided, use defaults from config
    //             if (parameters.length === 0 && config) {
    //                 const defaultParams = blockConfigManager.createDefaultParameters(blockType)
    //                 setBlockParameters(defaultParams)
    //             }
    //         } catch (error) {
    //             console.error(`Failed to load configuration for ${blockType}:`, error)
    //         } finally {
    //             setLoading(false)
    //         }
    //     }
        
    //     loadConfig()
    // }, [blockType, parameters.length])



    // Loading state for async config fetch
    const [loading, setLoading] = useState(true)
    
    // Position and size of the block
    const [position, setPosition] = useState<Position>(() => {
        // Initialize with provided position, or defaults if not provided
        const initialPos = {
            x: initialPosition.x ?? 50,
            y: initialPosition.y ?? 50,
            width: initialPosition.width ?? 100,  // Use provided width if available
            height: initialPosition.height ?? 100  // Use provided height if available
        }
        return initialPos
    })


    // State for selection and interaction
    // const [selected, setSelected] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    const [showResizeHandles, setShowResizeHandles] = useState(false)
    const [showParameterDialog, setShowParameterDialog] = useState(false)

    // Parameters for the block (editable by user)
    const [blockParameters, setBlockParameters] = useState<BlockParameter[]>(
        parameters.length > 0 ? parameters : [
            { name: 'gain', value: 1.0, type: 'number', description: 'Gain factor' },
            { name: 'enabled', value: true, type: 'boolean', description: 'Enable this block' },
            { name: 'name', value: 'test', type: 'string', description: 'Block name' }
        ]
    )

    // Ref hooks for managing state during interactions
    // Drag and resize state tracking
    const dragStartRef = useRef({ x: 0, y: 0 })
    const blockStartRef = useRef({ x: 0, y: 0 })
    const isDraggingRef = useRef(false)
    const clickCountRef = useRef(0)
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const resizeStartRef = useRef({ x: 0, y: 0 })
    const initialSizeRef = useRef({ width: 0, height: 0 })
    const resizeHandleRef = useRef<string>('')
    const isResizingRef = useRef(false)  // Add this line

    const initialPositionRef = useRef({ x: 0, y: 0 })
    // Effects to load block configuration - might not be necessary if config is static
    /**
     * Loads block configuration from JSON when blockType changes.
     * Sets default parameters if none are provided.
     */
    useEffect(() => {
        const loadConfig = async () => {
            try {
                setLoading(true)
                const config = await blockConfigManager.loadBlockConfig(blockType)
                setBlockConfig(config)
                
                // If no parameters provided, use defaults from config
                if (parameters.length === 0) {
                    const defaultParams = blockConfigManager.createDefaultParameters(blockType)
                    setBlockParameters(defaultParams)
                }
            } catch (error) {
                console.error(`Failed to load configuration for ${blockType}:`, error)
            } finally {
                setLoading(false)
            }
        }
        
        loadConfig()
    }, [blockType, parameters.length])

// Replace the position sync effect with this version that uses a different approach

useEffect(() => {
    console.log('Position sync effect running');
    
    // Skip position sync entirely if we're currently resizing (using ref for immediate check)
    if (isResizingRef.current) {
        console.log('Skipping position sync - currently resizing via ref');
        return;
    }
    
    // Only sync if we have valid position data
    if (initialPosition.x !== undefined && initialPosition.y !== undefined) {
        console.log('Syncing position from props:', initialPosition);
        setPosition(prev => ({
            ...prev,
            x: initialPosition.x,
            y: initialPosition.y,
            width: initialPosition.width ?? prev.width,
            height: initialPosition.height ?? prev.height
        }))
    }
}, [initialPosition.x, initialPosition.y, initialPosition.width, initialPosition.height])

    /**
     * Updates block size to match config defaults if not set in initialPosition.
     */
    useEffect(() => {
        if (blockConfig && initialPosition.width === undefined && initialPosition.height === undefined) {
            // Only set default size from config if no size was provided in props
            setPosition(prev => ({
                ...prev,
                width: blockConfig.styling.defaultSize.width,
                height: blockConfig.styling.defaultSize.height
            }))
        }
    }, [blockConfig]) // Remove initialPosition dependencies to prevent overwriting

    /**
     * Cleanup effect to remove any event listeners when the component unmounts.
     */
    useEffect(() => {
        return () => {
            // Cleanup any remaining click timeouts
            if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current)
            }
        }
    }, [])


    // All callbacks

    /**
     * Handle position/size changes and notify parent
     */
    const handlePositionChange = useCallback((newPosition: Position) => {
        setPosition(newPosition)
        // Notify parent component of position/size changes
        onPositionChange?.(id, newPosition)
    }, [id, onPositionChange])

    /**
     * Converts mouse event coordinates to SVG coordinates.
     */
    const getSVGMousePosition = useCallback((e: React.MouseEvent | MouseEvent) => {
        // Get the SVG element - try multiple approaches
        let svg: SVGSVGElement | null = null
        
        // For React events, try the standard approach
        if ('currentTarget' in e) {
            const target = e.target as SVGElement
            svg = target.ownerSVGElement
        }
        
        // For DOM events or if the above failed, find the SVG element
        if (!svg) {
            svg = document.querySelector('svg') as SVGSVGElement
        }
        
        if (!svg) return { x: 0, y: 0 }
        
        const point = svg.createSVGPoint()
        point.x = e.clientX
        point.y = e.clientY
        
        try {
            const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse())
            return {
                x: svgPoint.x,
                y: svgPoint.y
            }
        } catch (error) {
            console.error('Error converting mouse coordinates:', error)
            return { x: 0, y: 0 }
        }
    }, [])


    const calculateInputPortPosition = useCallback((index: number, totalPorts: number) => {
        if (totalPorts === 0) return { x: 0, y: 0 }
        
        // Divide height into equal sections and place ports in the center of each section
        const sectionHeight = position.height / totalPorts
        const baseY = sectionHeight * (index + 0.5) // +0.5 to center in the section
        
        return {
            x: 0, // Left side of block
            y: snapToGrid(baseY, GRID_SIZE) // Snap to grid
        }
    }, [position.height])

    const calculateOutputPortPosition = useCallback((index: number, totalPorts: number) => {
        if (totalPorts === 0) return { x: 0, y: 0 }
        
        // Divide height into equal sections and place ports in the center of each section
        const sectionHeight = position.height / totalPorts
        const baseY = sectionHeight * (index + 0.5) // +0.5 to center in the section
        
        return {
            x: position.width, // Right side of block
            y: snapToGrid(baseY, GRID_SIZE) // Snap to grid
        }
    }, [position.width, position.height])

    // If you have parameter ports or other port types, update them similarly:
    // const calculateParameterPortPosition = useCallback((index: number, totalPorts: number) => {
    //     const spacing = totalPorts > 1 ? (position.width - 20) / (totalPorts - 1) : 0
    //     const baseX = 10 + index * spacing
        
    //     return {
    //         x: snapToGrid(baseX, GRID_SIZE), // Snap to grid
    //         y: 0 // Top of block
    //     }
    // }, [position.width])

    /**
     * Handles updates to block parameters from the parameter dialog.
     */
    const handleParameterUpdate = useCallback((newParameters: BlockParameter[]) => {
        setBlockParameters(newParameters)
        onParameterChange?.(id, newParameters)
    }, [id, onParameterChange])


    /**
     * Handles mouse down on a port (for connection logic).
     */
    const handlePortMouseDown = useCallback((
        e: React.MouseEvent, 
        blockId: string, 
        portType: 'input' | 'output', 
        portIndex: number
    ) => {
        console.log(`Port clicked: ${portType} port ${portIndex} on block ${blockId}`)
    }, [])


    // Create stable resize move handler
    const handleResizeMove = useCallback((e: MouseEvent) => {
        console.log('handleResizeMove called, handle:', resizeHandleRef.current);
    
        if (!resizeHandleRef.current) {
            console.log('No resize handle set, returning');
            return;
        }
        
        const currentMouse = getSVGMousePosition(e);
        console.log('Current mouse position:', currentMouse);
        const handle = resizeHandleRef.current;
        
        const deltaX = currentMouse.x - resizeStartRef.current.x;
        const deltaY = currentMouse.y - resizeStartRef.current.y;
        
        let newWidth = initialSizeRef.current.width;
        let newHeight = initialSizeRef.current.height;
        let newX = initialPositionRef.current.x;
        let newY = initialPositionRef.current.y;
        
        switch (handle) {
            case 'nw':
                newWidth = Math.max(50, initialSizeRef.current.width - deltaX);
                newHeight = Math.max(30, initialSizeRef.current.height - deltaY);
                newX = initialPositionRef.current.x + (initialSizeRef.current.width - newWidth);
                newY = initialPositionRef.current.y + (initialSizeRef.current.height - newHeight);
                break;
            case 'ne':
                newWidth = Math.max(50, initialSizeRef.current.width + deltaX);
                newHeight = Math.max(30, initialSizeRef.current.height - deltaY);
                newY = initialPositionRef.current.y + (initialSizeRef.current.height - newHeight);
                break;
            case 'sw':
                newWidth = Math.max(50, initialSizeRef.current.width - deltaX);
                newHeight = Math.max(30, initialSizeRef.current.height + deltaY);
                newX = initialPositionRef.current.x + (initialSizeRef.current.width - newWidth);
                break;
            case 'se':
                newWidth = Math.max(50, initialSizeRef.current.width + deltaX);
                newHeight = Math.max(30, initialSizeRef.current.height + deltaY);
                break;
        }

        onPositionChange?.(id, {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight
});
        
        setPosition(currentPosition => {
            const newPosition = {
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight
            };
            
            // Force re-render by ensuring we return a new object
            // Check if values actually changed
            if (currentPosition.x === newPosition.x && 
                currentPosition.y === newPosition.y && 
                currentPosition.width === newPosition.width && 
                currentPosition.height === newPosition.height) {
                // Values are the same, but still return new object to force re-render
                return { ...newPosition };
            }
            
            console.log('Setting new position:', newPosition);
            console.log('Previous position was:', currentPosition);
            return newPosition;
        });

        console.log('Setting new position:', { x: newX, y: newY, width: newWidth, height: newHeight });
    }, [getSVGMousePosition]);

    const handleResizeUp = useCallback(() => {
        console.log('handleResizeUp called, isResizingRef was:', isResizingRef.current);
        isResizingRef.current = false;  // Clear ref IMMEDIATELY
        console.log('handleResizeUp set isResizingRef to:', isResizingRef.current);
        setIsResizing(false)
        resizeHandleRef.current = ''
        onDragEnd?.()
        
        // Get the CURRENT position from the component state, not the closure
        setPosition(currentPosition => {
            const finalPosition = {
                x: snapToGrid(currentPosition.x, GRID_SIZE),
                y: snapToGrid(currentPosition.y, GRID_SIZE),
                width: snapToGrid(currentPosition.width, GRID_SIZE),
                height: snapToGrid(currentPosition.height, GRID_SIZE)
            }
            
            // Notify Canvas once at the end
            onPositionChange?.(id, finalPosition)
            
            return finalPosition
        })
        
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeUp)
    }, [id, onPositionChange, onDragEnd])

    /**
     * Handles mouse down on a resize handle.
     * Initiates resizing logic for the block.
     */
    const handleResizeMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
        console.log('handleResizeMouseDown called with handle:', handle);
        if (e.button === 0) { // Only handle left mouse button

            e.stopPropagation();
            e.preventDefault();
            
            // Set BOTH ref AND state to ensure effect sees the change
            isResizingRef.current = true;
            setIsResizing(true);
            console.log('Set isResizingRef.current to:', isResizingRef.current, 'and isResizing state to: true');
            
            const svgMousePos = getSVGMousePosition(e);
            console.log('Initial SVG position:', svgMousePos);
            
            resizeStartRef.current = svgMousePos;
            initialSizeRef.current = { width: position.width, height: position.height };
            initialPositionRef.current = { x: position.x, y: position.y };
            resizeHandleRef.current = handle;
            onDragStart?.();
            
            console.log('Adding event listeners for resize');
            document.addEventListener('mousemove', handleResizeMove);
            document.addEventListener('mouseup', handleResizeUp);
        }
    }, [position, getSVGMousePosition, onDragStart]);

    /**
     * Handles mouse down on the block for drag, selection, and double-click.
     * Implements custom double-click detection to avoid React SVG event issues.
     */
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        
        if (e.button === 0) {
            e.preventDefault()
            e.stopPropagation()

            const svgMousePos = getSVGMousePosition(e)
        
            dragStartRef.current = svgMousePos
            blockStartRef.current = { x: position.x, y: position.y }
            isDraggingRef.current = false

            // Check for multi-select (Ctrl/Cmd key)
            const multiSelect = e.ctrlKey || e.metaKey

            // Mouse move handler for dragging
            const handleMouseMove = (e: MouseEvent) => {
                const currentMouse = getSVGMousePosition(e)
                
                const deltaX = currentMouse.x - dragStartRef.current.x
                const deltaY = currentMouse.y - dragStartRef.current.y
                
                const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
                if (dragDistance > 3 && !isDraggingRef.current) {
                    isDraggingRef.current = true
                    setIsDragging(true)
                    onDragStart?.() // ADD THIS LINE - call when drag starts

                    // If this block isn't selected, select it
                    if (!selected && onSelect) {
                        onSelect(id, true, false)
                    }

                    // Cancel click detection if drag starts
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current)
                        clickCountRef.current = 0
                    }
                }
                
                // If dragging, handle group movement
                if (isDraggingRef.current) {
                    // Always use the Canvas position handler - it will handle group movement
                    const newPosition = {
                        ...position,
                        x: blockStartRef.current.x + deltaX,
                        y: blockStartRef.current.y + deltaY
                    }
                    handlePositionChange(newPosition)
                }
            }

            /**
             * Handles mouse up to finalize drag or handle single/double click.
             */
            const handleMouseUp = () => {
                if (!isDraggingRef.current) {
                    clickCountRef.current++
                    
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current)
                    }
                    
                    if (clickCountRef.current === 1) {
                        // Wait to see if this becomes a double-click
                        clickTimeoutRef.current = setTimeout(() => {
                            // Toggle selection with proper multi-select handling
                            if (onSelect) {
                                onSelect(id, !selected, multiSelect)
                            }
                            clickCountRef.current = 0
                        }, 250)
                    } else if (clickCountRef.current === 2) {
                        // Double-click confirmed - add logging back
                        console.log('Double-click detected, opening dialog')
                        console.log('Current blockParameters:', blockParameters)
                        console.log('Current showParameterDialog:', showParameterDialog)
                        setShowParameterDialog(true)
                        clickCountRef.current = 0
                    }
                } else {
                    // Dragging just ended - notify Canvas to reset group drag
                    onDragEnd?.()
                }
                
                setIsDragging(false)
                isDraggingRef.current = false
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }

            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        }
        else if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();

            const svgPoint = getSVGMousePosition(e);
            const startPoint = { x: svgPoint.x, y: svgPoint.y };

            // Get the block's current position
            const blockX = initialPosition.x;
            const blockY = initialPosition.y;

            // Calculate offset from pointer to block origin
            const offsetX = blockX - startPoint.x;
            const offsetY = blockY - startPoint.y;

            let dragThresholdMet = false;
            let duplicateCreated = false;
            let duplicateElements: SVGGElement[] = [];
            let blockOffsets: { [blockId: string]: { x: number, y: number } } = {};

            // For group: calculate offsets for all selected blocks
            if (selected && selectedBlocks && selectedBlocks.length > 1) {
                selectedBlocks.forEach(blockId => {
                    const originalElement = document.getElementById(`${blockId}-group`);
                    if (originalElement) {
                        const transform = originalElement.getAttribute('transform') || '';
                        const matches = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
                        if (matches) {
                            const x = parseFloat(matches[1]);
                            const y = parseFloat(matches[2]);
                            blockOffsets[blockId] = { x: x - startPoint.x, y: y - startPoint.y };
                        }
                    }
                });
            }

            const handleRightMouseMove = (e: MouseEvent) => {
                const currentPoint = getSVGMousePosition(e as any);
                const deltaX = currentPoint.x - startPoint.x;
                const deltaY = currentPoint.y - startPoint.y;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                // Create ghost elements for all selected blocks once drag threshold is met
                if (distance > 5 && !dragThresholdMet) {
                    dragThresholdMet = true;
                    duplicateCreated = true;

                    if (selected && selectedBlocks && selectedBlocks.length > 1) {
                        selectedBlocks.forEach(blockId => {
                            const originalElement = document.getElementById(`${blockId}-group`);
                            if (originalElement) {
                                const duplicateElement = originalElement.cloneNode(true) as SVGGElement;
                                duplicateElement.id = `${blockId}_ghost`;
                                duplicateElement.style.opacity = '0.5';
                                duplicateElement.style.pointerEvents = 'none';
                                originalElement.parentElement?.appendChild(duplicateElement);
                                duplicateElements.push(duplicateElement);
                            }
                        });
                    } else {
                        // Single block duplication
                        const originalElement = document.getElementById(`${id}-group`);
                        if (originalElement) {
                            const duplicateElement = originalElement.cloneNode(true) as SVGGElement;
                            duplicateElement.id = `${id}_ghost`;
                            duplicateElement.style.opacity = '0.5';
                            duplicateElement.style.pointerEvents = 'none';
                            originalElement.parentElement?.appendChild(duplicateElement);
                            duplicateElements.push(duplicateElement);
                        }
                    }
                }

                // Move all ghost elements as a group
                if (duplicateCreated && duplicateElements.length > 0) {
                    duplicateElements.forEach((duplicateElement, index) => {
                        let blockId = selectedBlocks && selectedBlocks.length > 1
                            ? selectedBlocks[index]
                            : id;
                        const offset = selected && selectedBlocks && selectedBlocks.length > 1
                            ? blockOffsets[blockId] || { x: 0, y: 0 }
                            : { x: offsetX, y: offsetY }; // <-- Use offset for single block
                        const newX = startPoint.x + deltaX + offset.x;
                        const newY = startPoint.y + deltaY + offset.y;
                        duplicateElement.setAttribute('transform', `translate(${newX}, ${newY})`);
                    });
                }
            };

            const handleRightMouseUp = (e: MouseEvent) => {
                document.removeEventListener('mousemove', handleRightMouseMove);
                document.removeEventListener('mouseup', handleRightMouseUp);

                // Remove all ghost elements
                duplicateElements.forEach(element => element.remove());

                // Calculate final mouse delta
                const currentPoint = getSVGMousePosition(e as any);
                const deltaX = currentPoint.x - startPoint.x;
                const deltaY = currentPoint.y - startPoint.y;

                // Notify Canvas to create real blocks at new positions
                if (duplicateCreated && duplicateElements.length > 0 && onContextMenu) {
                    if (selected && selectedBlocks && selectedBlocks.length > 1) {
                        onContextMenu(`duplicate:${id}:group`, deltaX, deltaY, id);
                    } else {
                        // For single block, pass delta as usual
                        onContextMenu(`duplicate:${id}:${id}_ghost`, deltaX, deltaY);
                    }
                } else if (onContextMenu) {
                    onContextMenu(id, e.clientX, e.clientY);
                }
            };

            document.addEventListener('mousemove', handleRightMouseMove);
            document.addEventListener('mouseup', handleRightMouseUp);
            onDragEnd?.();
        }
        //     e.preventDefault()
        //     e.stopPropagation()
            
        //     const svgPoint = getSVGMousePosition(e)
        //     const startPoint = { x: svgPoint.x, y: svgPoint.y }
        //     const newDuplicateId = `${blockType.toLowerCase()}_${Date.now()}`
            
        //     let duplicateElement: SVGGElement | null = null
        //     let dragThresholdMet = false
        //     let duplicateCreated = false
            
        //     const handleRightMouseMove = (e: MouseEvent) => {
        //         const currentPoint = getSVGMousePosition(e as any)
        //         const deltaX = currentPoint.x - startPoint.x
        //         const deltaY = currentPoint.y - startPoint.y
        //         const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
                
        //         // Create duplicate DOM element directly without React
        //         if (distance > 5 && !dragThresholdMet) {
        //             dragThresholdMet = true
        //             duplicateCreated = true
                    
        //             // Get the original block's SVG element
        //             const originalElement = document.getElementById(`${id}-group`)
        //             if (originalElement) {
        //                 // Clone the original element
        //                 duplicateElement = originalElement.cloneNode(true) as SVGGElement
        //                 duplicateElement.id = `${newDuplicateId}-group`
        //                 duplicateElement.style.opacity = '0.7'
        //                 duplicateElement.style.pointerEvents = 'none'
                        
        //                 // Add to the same parent (the SVG canvas)
        //                 originalElement.parentElement?.appendChild(duplicateElement)
        //             }
        //         }
                
        //         // Update duplicate position by directly manipulating the DOM
        //         if (duplicateCreated && duplicateElement) {
        //             const newX = currentPoint.x - position.width / 2
        //             const newY = currentPoint.y - position.height / 2
        //             duplicateElement.setAttribute('transform', `translate(${newX}, ${newY})`)
        //         }
        //     }
            
        //     const handleRightMouseUp = (e: MouseEvent) => {
        //         // Clean up event listeners
        //         document.removeEventListener('mousemove', handleRightMouseMove)
        //         document.removeEventListener('mouseup', handleRightMouseUp)
                
        //         if (duplicateCreated && duplicateElement) {
        //             // Get final position from the DOM element
        //             const transform = duplicateElement.getAttribute('transform') || ''
        //             const matches = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
                    
        //             if (matches) {
        //                 const finalX = parseFloat(matches[1])
        //                 const finalY = parseFloat(matches[2])
                        
        //                 // Remove the temporary DOM element
        //                 duplicateElement.remove()
                        
        //                 // NOW create the React block with the final position
        //                 if (onContextMenu) {
        //                     onContextMenu(`duplicate:${id}:${newDuplicateId}`, finalX + position.width / 2, finalY + position.height / 2)
        //                 }
        //             }
        //         } else {
        //             // Show context menu
        //             if (onContextMenu) {
        //                 onContextMenu(id, e.clientX, e.clientY)
        //             }
        //         }
        //     }
            
        //     // Add event listeners
        //     document.addEventListener('mousemove', handleRightMouseMove)
        //     document.addEventListener('mouseup', handleRightMouseUp)
        // }
    }, [position, getSVGMousePosition, id, blockType, onContextMenu, selected, onSelect, onDragStart, onDragEnd])
    /**
     * Handle context menu event - prevent default to avoid browser menu
     */
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // Context menu is handled in the right-click mousedown event
    }, [])

    // NOW WE CAN DO EARLY RETURNS AFTER ALL HOOKS ARE DECLARED
    
    // Block styling
    const blockStyle: BlockStyle = {
        fill: blockConfig?.styling.color || 'white',
        stroke: selected ? 'blue' : (blockConfig?.styling.borderColor || 'black'),
        strokeWidth: selected ? 2 : 1,
        resizeCornerSize: 8, // Increased from 8 for easier grabbing
        portSize: 8
    }

    const shadowOffset = 3

    // Early Return for Loading State
    if (loading || !blockConfig) {
        return (
            <g transform={`translate(${position.x}, ${position.y})`}>
                <rect
                    width={100}
                    height={40}
                    fill="#f0f0f0"
                    stroke="#ccc"
                    rx="2"
                />
                <text
                    x={50}
                    y={25}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#666"
                >
                    Loading...
                </text>
            </g>
        )
    }

    
    console.log('Rendering with position:', position);
    // Main Render
    return (
        <>
            <g
                id={`${id}-group`}
                transform={`translate(${position.x}, ${position.y})`}
                style={{
                    opacity: ghost ? 0.5 : 1, // <-- add this line
                }}
                onMouseEnter={() => !isDragging && !isResizing && setShowResizeHandles(true)}
                onMouseLeave={() => !isDragging && !isResizing && setShowResizeHandles(false)}
                // onMouseDown={handleRightMouseDown}
                onContextMenu={handleContextMenu} 
            >
                {/* Mask component handles the visual appearance */}
                <g 
                    style={{ 
                        cursor: isDragging ? 'grabbing' : 'grab',
                        userSelect: 'none',
                    }}
                    onMouseDown={handleMouseDown}
                >
                    <Mask
                        blockType={blockType}
                        parameters={blockParameters}
                        width={position.width}
                        height={position.height}
                        selected={selected}
                    />
                </g>

                {/* Input ports */}
                {Array.from({ length: blockConfig.ports.inputs }, (_, index) => {
                    const portPos = calculateInputPortPosition(index, blockConfig.ports.inputs)
                    return (
                        <Port
                            key={`input-${index}`}
                            blockId={id}
                            portType="input"
                            portIndex={index}
                            x={portPos.x}
                            y={portPos.y}
                            size={blockStyle.portSize}
                            onPortMouseDown={handlePortMouseDown}
                        />
                    )
                })}

                {/* Output ports */}
                {Array.from({ length: blockConfig.ports.outputs }, (_, index) => {
                    const portPos = calculateOutputPortPosition(index, blockConfig.ports.outputs)
                    return (
                        <Port
                            key={`output-${index}`}
                            blockId={id}
                            portType="output"
                            portIndex={index}
                            x={portPos.x}
                            y={portPos.y}
                            size={blockStyle.portSize}
                            onPortMouseDown={handlePortMouseDown}
                        />
                    )
                })}

                {/* Block label */}
                <text
                    x={position.width / 2}
                    y={position.height + 20}
                    textAnchor="middle"
                    fontSize="12"
                    fontFamily="sans-serif"
                    fill="gray"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                    {id}
                </text>

                {/* Resize handles */}
                {showResizeHandles && !isDragging && !isResizing && (
                    <>
                        {/* Northwest resize handle */}
                        <g>
                            {/* Large invisible interactive area */}
                            <rect
                                x={-16}
                                y={-16}
                                width={24}
                                height={24}
                                fill="transparent"
                                style={{ cursor: 'nwse-resize' }}
                                onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
                            />
                            {/* Visible handle */}
                            <rect
                                x={-blockStyle.resizeCornerSize / 2}
                                y={-blockStyle.resizeCornerSize / 2}
                                width={blockStyle.resizeCornerSize}
                                height={blockStyle.resizeCornerSize}
                                fill="white"
                                stroke="gray"
                                strokeWidth={1}
                                style={{ pointerEvents: 'none' }}
                            />
                        </g>

                        {/* Northeast resize handle */}
                        <g>
                            <rect
                                x={position.width - 8}
                                y={-16}
                                width={24}
                                height={24}
                                fill="transparent"
                                style={{ cursor: 'nesw-resize' }}
                                onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
                            />
                            <rect
                                x={position.width - blockStyle.resizeCornerSize / 2}
                                y={-blockStyle.resizeCornerSize / 2}
                                width={blockStyle.resizeCornerSize}
                                height={blockStyle.resizeCornerSize}
                                fill="white"
                                stroke="gray"
                                strokeWidth={1}
                                style={{ pointerEvents: 'none' }}
                            />
                        </g>

                        {/* Southwest resize handle */}
                        <g>
                            <rect
                                x={-16}
                                y={position.height - 8}
                                width={24}
                                height={24}
                                fill="transparent"
                                style={{ cursor: 'nesw-resize' }}
                                onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
                            />
                            <rect
                                x={-blockStyle.resizeCornerSize / 2}
                                y={position.height - blockStyle.resizeCornerSize / 2}
                                width={blockStyle.resizeCornerSize}
                                height={blockStyle.resizeCornerSize}
                                fill="white"
                                stroke="gray"
                                strokeWidth={1}
                                style={{ pointerEvents: 'none' }}
                            />
                        </g>

                        {/* Southeast resize handle */}
                        <g>
                            <rect
                                x={position.width - 8}
                                y={position.height - 8}
                                width={24}
                                height={24}
                                fill="transparent"
                                style={{ cursor: 'nwse-resize' }}
                                onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
                            />
                            <rect
                                x={position.width - blockStyle.resizeCornerSize / 2}
                                y={position.height - blockStyle.resizeCornerSize / 2}
                                width={blockStyle.resizeCornerSize}
                                height={blockStyle.resizeCornerSize}
                                fill="white"
                                stroke="gray"
                                strokeWidth={1}
                                style={{ pointerEvents: 'none' }}
                            />
                        </g>
                    </>
                )}
            </g>

            {/* Parameter Dialog */}
            {showParameterDialog && blockConfig && (
                <ParameterDialog
                    blockId={id}
                    blockConfig={blockConfig}
                    parameters={blockParameters}
                    onParameterUpdate={handleParameterUpdate}
                    onClose={() => setShowParameterDialog(false)}
                />
            )}
        </>
    )
}

/**
 * Props for the ParameterDialog component.
 */
interface ParameterDialogProps {
    blockId: string
    blockConfig: BlockConfiguration
    parameters: BlockParameter[]
    onParameterUpdate: (parameters: BlockParameter[]) => void
    onClose: () => void
}

/**
 * Modal dialog for editing block parameters.
 * Allows user to change parameter values and save/cancel changes.
 */
function ParameterDialog({ 
    blockId, 
    blockConfig, 
    parameters, 
    onParameterUpdate, 
    onClose 
}: ParameterDialogProps) {
    const [localParameters, setLocalParameters] = useState<BlockParameter[]>(parameters)

    /**
     * Handles changes to individual parameter fields.
     */
    const handleParameterChange = useCallback((index: number, field: keyof BlockParameter, value: any) => {
        setLocalParameters(prev => 
            prev.map((param, i) => 
                i === index ? { ...param, [field]: value } : param
            )
        )
    }, [])

    /**
     * Handles saving changes and closing the dialog.
     */
    const handleSave = useCallback(() => {
        onParameterUpdate(localParameters)
        onClose()
    }, [localParameters, onParameterUpdate, onClose])

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: '300px'
        }}>
            <h3>Block Parameters: {blockId}</h3>
            <p><strong>Type:</strong> {blockConfig.displayName}</p>
            
            <div style={{ marginBottom: '20px' }}>
                {localParameters.map((param, index) => (
                    <div key={param.name} style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            {param.name}
                        </label>
                        {param.description && (
                            <p style={{ fontSize: '12px', color: '#666', margin: '0 0 5px 0' }}>
                                {param.description}
                            </p>
                        )}
                        {param.type === 'boolean' ? (
                            <input
                                type="checkbox"
                                checked={param.value as boolean}
                                onChange={(e) => handleParameterChange(index, 'value', e.target.checked)}
                            />
                        ) : (
                            <input
                                type={param.type === 'number' ? 'number' : 'text'}
                                value={param.value}
                                onChange={(e) => handleParameterChange(index, 'value', 
                                    param.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                                )}
                                style={{
                                    width: '100%',
                                    padding: '5px',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px'
                                }}
                            />
                        )}
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{
                    padding: '8px 16px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    cursor: 'pointer'
                }}>
                    Cancel
                </button>
                <button onClick={handleSave} style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    cursor: 'pointer'
                }}>
                    Save
                </button>
            </div>
        </div>
    )
}

export default Block