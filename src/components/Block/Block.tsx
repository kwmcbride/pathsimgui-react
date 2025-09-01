import React, { useState, useRef, useCallback, useEffect, memo, useMemo } from 'react'
import Port from '../Port/Port'
import Mask from '../Mask/Mask'
import EditableLabel from '../interface/EditableLabel'
import blockConfigManager from '../../lib/BlockConfigManager'
import { snapToGrid, GRID_SIZE } from '../../utilities/grid'
import generalConfig from '../../config/generalConfig.json'
import { Point } from '../Signal/Signal'
import { BlockConfiguration } from '../../lib/BlockConfigManager'

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
    allBlocks?: {id: string}[]
    onParameterChange?: (blockId: string, parameters: BlockParameter[]) => void
    onPositionChange?: (blockId: string, position: Position) => void
    onGroupMove?: (deltas: Record<string, { deltaX: number, deltaY: number }>) => void // Add this
    onContextMenu?: (blockId: string, x: number, y: number) => void
    onSelect?: (blockId: string, isSelected: boolean, multiSelect?: boolean) => void
    onDragStart?: () => void
    onDragEnd?: () => void
    onRename?: (oldId: string, newId: string) => void
    onPortMouseDown?: (e: React.MouseEvent, blockId: string, portType: 'input' | 'output', portIndex: number, absolutePos: Point) => void
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
    onDragEnd,
    onRename,
    onPortMouseDown
}: BlockProps) {
    // State hooks, these need to be at the top

    // console.log(`🔄 Block ${id} rendering. Position:`, initialPosition, 'Selected:', selected)
    const config = generalConfig.blocks;
    console.log('generalConfig.blocks:', generalConfig.blocks)

    // Seems redundant
    const blockConfig = useMemo(() => {
        const loadedConfig = blockConfigManager.getConfiguration(blockType)
        
        if (loadedConfig) {
            return loadedConfig
        }
        
        // Provide block-type-specific fallbacks instead of generic ones
        const fallbackConfig = {
            blockType,
            displayName: blockType,
            ports: blockType === 'constant' 
                ? { inputs: 0, outputs: 1 }  // Constant blocks have no inputs
                : blockType === 'gain'
                ? { inputs: 1, outputs: 1 }  // Gain blocks have 1 input, 1 output
                : { inputs: 1, outputs: 1 }, // Default fallback
            styling: {
                defaultSize: { 
                    width: config.defaultWidth || 100,   // Use generalConfig.blocks.defaultWidth
                    height: config.defaultHeight || 60   // Use generalConfig.blocks.defaultHeight
                },
                color: config.backgroundColor || '#ffffff',
                borderColor: config.borderColor || '#000000',
                textColor: config.fontColor || '#000000'
            }
        }
        
        return fallbackConfig
    }, [blockType, config.defaultWidth, config.defaultHeight, config.backgroundColor, config.borderColor, config.fontColor])

    
    // Block styling
    const blockStyle: BlockStyle = {
        fill: blockConfig?.styling.color || config.backgroundColor,
        stroke: selected ? config.selectedBorderColor : (blockConfig?.styling.borderColor || config.borderColor),
        strokeWidth: selected ? config.borderWidth : 1,
        resizeCornerSize: config.resizeHandleSize,
        portSize: config.portRadius
    }

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
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [editingLabelText, setEditingLabelText] = useState(id)

    // Parameters for the block (editable by user)
    const [blockParameters, setBlockParameters] = useState<BlockParameter[]>(() => {
        if (parameters.length > 0) return parameters
        
        // Default parameters based on block type
        switch (blockType) {
            case 'constant':
                return [
                    { name: 'value', value: 1.0, type: 'number', description: 'Constant output value' }
                ]
            case 'gain':
                return [
                    { name: 'gain', value: 1.0, type: 'number', description: 'Gain factor' }
                ]
            default:
                return [
                    { name: 'value', value: 1.0, type: 'number', description: 'Block value' }
                ]
        }
    })

    // Ref hooks for managing state during interactions
    // Drag and resize state tracking
    const dragStartRef = useRef({ x: 0, y: 0 })
    const blockStartRef = useRef({ x: 0, y: 0 })
    const isDraggingRef = useRef(false)
    const clickCountRef = useRef(0)
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const throttleRef = useRef<NodeJS.Timeout | null>(null)

    const resizeStartRef = useRef({ x: 0, y: 0 })
    const initialSizeRef = useRef({ width: 0, height: 0 })
    const resizeHandleRef = useRef<string>('')
    const isResizingRef = useRef(false)  // Add this line

    const initialPositionRef = useRef({ x: 0, y: 0 })

    const labelInputRef = useRef<HTMLInputElement>(null)
    
    // Also update your position sync effect to be less restrictive:
    useEffect(() => {
        // Guard: need valid incoming coords
        if (initialPosition.x == null || initialPosition.y == null) return

        const incoming = {
            x: initialPosition.x,
            y: initialPosition.y,
            width: initialPosition.width ?? position.width,
            height: initialPosition.height ?? position.height
        }

        const changed =
            incoming.x !== position.x ||
            incoming.y !== position.y ||
            incoming.width !== position.width ||
            incoming.height !== position.height

        if (!changed) return

        // If dragging a single block we are already updating local state in handleMouseMove;
        // letting parent overwrite every frame can introduce jitter. So skip during single drag.
        if (isDraggingRef.current) {
            const isGroupDrag = selected && selectedBlocks && selectedBlocks.length > 1
            if (!isGroupDrag) {
                // Single-block drag: ignore parent updates mid-drag
                return
            }
            // Group drag: accept parent updates so lead block moves with the group
        }

        setPosition(incoming)
    }, [
        initialPosition.x,
        initialPosition.y,
        initialPosition.width,
        initialPosition.height,
        selected,
        selectedBlocks,
        position.x,
        position.y,
        position.width,
        position.height
    ])

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

    /**
     * Bring block to front when selected or being dragged
     */
    useEffect(() => {
        if ((selected || isDragging) && !isPreview) {
            const blockElement = document.getElementById(`${id}-group`)
            if (blockElement && blockElement.parentNode) {
                // Move this element to the end of its parent (highest z-index)
                blockElement.parentNode.appendChild(blockElement)
            }
        }
    }, [selected, isDragging, isPreview, id])


    useEffect(() => {
        console.log(`Block ${id} (${blockType}) - inputs: ${blockConfig.ports.inputs}, outputs: ${blockConfig.ports.outputs}`)
    }, [id, blockType, blockConfig.ports.inputs, blockConfig.ports.outputs])


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
        if (!resizeHandleRef.current) {
            return;
        }
        
        const currentMouse = getSVGMousePosition(e);
        const handle = resizeHandleRef.current;
        
        const deltaX = currentMouse.x - resizeStartRef.current.x;
        const deltaY = currentMouse.y - resizeStartRef.current.y;
        
        let newWidth = initialSizeRef.current.width;
        let newHeight = initialSizeRef.current.height;
        let newX = initialPositionRef.current.x;
        let newY = initialPositionRef.current.y;
        
        switch (handle) {
            case 'nw':
                newWidth = Math.max(config.minWidth, initialSizeRef.current.width - deltaX);
                newHeight = Math.max(config.minHeight, initialSizeRef.current.height - deltaY);
                newX = initialPositionRef.current.x + (initialSizeRef.current.width - newWidth);
                newY = initialPositionRef.current.y + (initialSizeRef.current.height - newHeight);
                break;
            case 'ne':
                newWidth = Math.max(config.minWidth, initialSizeRef.current.width + deltaX);
                newHeight = Math.max(config.minHeight, initialSizeRef.current.height - deltaY);
                newY = initialPositionRef.current.y + (initialSizeRef.current.height - newHeight);
                break;
            case 'sw':
                newWidth = Math.max(config.minWidth, initialSizeRef.current.width - deltaX);
                newHeight = Math.max(config.minHeight, initialSizeRef.current.height + deltaY);
                newX = initialPositionRef.current.x + (initialSizeRef.current.width - newWidth);
                break;
            case 'se':
                newWidth = Math.max(config.minWidth, initialSizeRef.current.width + deltaX);
                newHeight = Math.max(config.minHeight, initialSizeRef.current.height + deltaY);
                break;
        }

        const newPosition = {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight
        };

        // Update local state immediately for smooth rendering
        setPosition(currentPosition => {
            // Only update if values actually changed
            if (currentPosition.x === newPosition.x && 
                currentPosition.y === newPosition.y && 
                currentPosition.width === newPosition.width && 
                currentPosition.height === newPosition.height) {
                return currentPosition;
            }
            return newPosition;
        });

        // Schedule Canvas update for next tick to avoid render cycle conflict
        setTimeout(() => {
            onPositionChange?.(id, newPosition);
        }, 0);

    }, [getSVGMousePosition, config.minWidth, config.minHeight, id, onPositionChange]);

    // Create stable resize up handler
    const handleResizeUp = useCallback(() => {
        isResizingRef.current = false;
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
            
            // Schedule final Canvas update for next tick
            setTimeout(() => {
                onPositionChange?.(id, finalPosition);
            }, 0);
            
            return finalPosition
        })
        
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeUp)
    }, [id, onPositionChange, onDragEnd, handleResizeMove])


    /**
     * Handles mouse down on a resize handle.
     * Initiates resizing logic for the block.
     */
    const handleResizeMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
        // console.log('handleResizeMouseDown called with handle:', handle);
        if (e.button === 0) { // Only handle left mouse button

            // e.stopPropagation();
            e.preventDefault();
            
            // Set BOTH ref AND state to ensure effect sees the change
            isResizingRef.current = true;
            setIsResizing(true);
            // console.log('Set isResizingRef.current to:', isResizingRef.current, 'and isResizing state to: true');
            
            const svgMousePos = getSVGMousePosition(e);
            // console.log('Initial SVG position:', svgMousePos);
            
            resizeStartRef.current = svgMousePos;
            initialSizeRef.current = { width: position.width, height: position.height };
            initialPositionRef.current = { x: position.x, y: position.y };
            resizeHandleRef.current = handle;
            onDragStart?.();
            
            // console.log('Adding event listeners for resize');
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
            // e.stopPropagation()

            const svgMousePos = getSVGMousePosition(e)
            dragStartRef.current = svgMousePos
            blockStartRef.current = { x: position.x, y: position.y }
            isDraggingRef.current = false

            const multiSelect = e.ctrlKey || e.metaKey

            const handleMouseMove = (e: MouseEvent) => {
                const currentMouse = getSVGMousePosition(e)
                const deltaX = currentMouse.x - dragStartRef.current.x
                const deltaY = currentMouse.y - dragStartRef.current.y

                if (!isDraggingRef.current && (Math.abs(deltaX) > config.minDistanceDragStart || Math.abs(deltaY) > config.minDistanceDragStart)) {
                    isDraggingRef.current = true
                    setIsDragging(true)
                    onDragStart?.()
                }

                if (isDraggingRef.current) {
                    const isGroupDrag = selected && selectedBlocks && selectedBlocks.length > 1

                    // NEW: always compute snapped coords (single drag uses them locally)
                    const rawX = blockStartRef.current.x + deltaX
                    const rawY = blockStartRef.current.y + deltaY
                    const snappedX = snapToGrid(rawX, GRID_SIZE)
                    const snappedY = snapToGrid(rawY, GRID_SIZE)

                    // Build position object (snapped so Canvas + local stay aligned)
                    const newPosition = {
                        ...position,
                        x: snappedX,
                        y: snappedY
                    }

                    if (!isGroupDrag) {
                        // Single-block drag: update local immediately (snapped)
                        setPosition(prev =>
                            prev.x === newPosition.x && prev.y === newPosition.y
                                ? prev
                                : newPosition
                        )
                    } else {
                        // If the drag involves multiple blocks, we need to notify the parent
                        // This is necessary to show the blocks moving together with some throttled renders
                        // Group drag: need to notify parent for coordinated movement
                        if (!throttleRef.current) {
                            throttleRef.current = setTimeout(() => {
                                onPositionChange?.(id, newPosition)
                                throttleRef.current = null
                            }, 16) // 60fps updates for smooth group drag
                        }
                    }
                }
            }

            const handleMouseUp = (e: MouseEvent) => {
                // Flush any pending throttled update
                if (throttleRef.current) {
                    clearTimeout(throttleRef.current)
                    throttleRef.current = null
                }

                if (isDraggingRef.current) {
                    
                    // Use the mouse position at mouse up!
                    const mouse = getSVGMousePosition(e);
                    const deltaX = mouse.x - dragStartRef.current.x;
                    const deltaY = mouse.y - dragStartRef.current.y;

                    const rawX = blockStartRef.current.x + deltaX;
                    const rawY = blockStartRef.current.y + deltaY;
                    const snappedX = snapToGrid(rawX, GRID_SIZE);
                    const snappedY = snapToGrid(rawY, GRID_SIZE);

                    onPositionChange?.(id, {
                        x: snappedX,
                        y: snappedY,
                        width: position.width,
                        height: position.height
                    });
                    onDragEnd?.();
                } else {
                    onSelect?.(id, !selected, e && (e.ctrlKey || e.metaKey));
                }

                setIsDragging(false);
                isDraggingRef.current = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        else if (e.button === 2) {
            e.preventDefault();
            // e.stopPropagation();

            const svgPoint = getSVGMousePosition(e);
            const startPoint = { x: svgPoint.x, y: svgPoint.y };

            // Get the block's current position
            const blockX = position.x;
            const blockY = position.y;

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
                                duplicateElement.style.opacity = config.copyOpacity.toString();
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
                            duplicateElement.style.opacity = config.copyOpacity.toString();
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
                        const snappedX = snapToGrid(newX, GRID_SIZE);
                        const snappedY = snapToGrid(newY, GRID_SIZE);
                        duplicateElement.setAttribute('transform', `translate(${snappedX}, ${snappedY})`);
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
    }, [position, getSVGMousePosition, id, blockType, onContextMenu, selected, onSelect, onDragStart, onDragEnd, onPositionChange, selectedBlocks])


    /**
     * Handle context menu event - prevent default to avoid browser menu
     */
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // Context menu is handled in the right-click mousedown event
    }, [])


    // Replace the existing label constants and handlers with these updated versions:

    const LABEL_INPUT_MIN_WIDTH = 40
    const LABEL_INPUT_MAX_WIDTH = 150
    const LABEL_INPUT_PADDING = 16
    const LABEL_FONT_SIZE = 12
    const LABEL_MAX_LINES = 3 // Maximum number of lines before scrolling

    const handleLabelDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsEditingLabel(true)
        setEditingLabelText(id)
        
        // Focus the input after it renders
        setTimeout(() => {
            labelInputRef.current?.focus()
            labelInputRef.current?.select()
        }, 10)
    }, [id])

    const calculateInputDimensions = useCallback((text: string) => {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) return { width: LABEL_INPUT_MIN_WIDTH, height: 20 }
        
        context.font = `${LABEL_FONT_SIZE}px Arial`
        const textWidth = context.measureText(text).width
        
        // Calculate how many lines we need
        const maxCharsPerLine = Math.floor(LABEL_INPUT_MAX_WIDTH / (LABEL_FONT_SIZE * 0.6))
        const lines = Math.ceil(text.length / maxCharsPerLine)
        const actualLines = Math.min(lines, LABEL_MAX_LINES)
        
        // Calculate width
        let width
        if (textWidth + LABEL_INPUT_PADDING <= LABEL_INPUT_MAX_WIDTH) {
            // Text fits on one line
            width = Math.max(LABEL_INPUT_MIN_WIDTH, textWidth + LABEL_INPUT_PADDING)
        } else {
            // Text needs multiple lines, use max width
            width = LABEL_INPUT_MAX_WIDTH
        }
        
        // Calculate height based on number of lines
        const lineHeight = LABEL_FONT_SIZE + 4 // Add some line spacing
        const height = Math.max(20, actualLines * lineHeight + 4) // +4 for padding
        
        return { width, height }
    }, [])

    const handleLabelSave = useCallback(() => {
        const newName = editingLabelText.trim()
        
        // Allow saving the same name (no validation error)
        if (newName === id) {
            setIsEditingLabel(false)
            return
        }
        
        if (newName && onRename) {
            // Simple validation
            if (/^[a-zA-Z0-9_-\s]+$/.test(newName)) { // Allow spaces
                const existingNames = allBlocks?.map(b => b.id) || []
                if (!existingNames.includes(newName)) {
                    onRename(id, newName)
                    setIsEditingLabel(false)
                    return
                }
            }
        }
        
        // If validation fails or no change, just close
        setIsEditingLabel(false)
    }, [editingLabelText, id, onRename, allBlocks])

    const handleLabelCancel = useCallback(() => {
        setIsEditingLabel(false)
        setEditingLabelText(id)
    }, [id])

    const handleLabelKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Prevent event bubbling to avoid browser navigation
        e.stopPropagation()
        
        if (e.key === 'Enter') {
            e.preventDefault() // Prevent form submission/page refresh
            handleLabelSave()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            handleLabelCancel()
        }
        // Allow other keys (typing, backspace, etc.) to work normally
    }, [handleLabelSave, handleLabelCancel])

    const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setEditingLabelText(e.target.value)
    }, [])

    const handleLabelBlur = useCallback(() => {
        // Small delay to allow other events to process first
        setTimeout(() => {
            if (isEditingLabel) {
                handleLabelSave()
            }
        }, 100)
    }, [isEditingLabel, handleLabelSave])


    const inputPorts = useMemo(() => {
        return Array.from({ length: blockConfig.ports.inputs }, (_, index) => {
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
        })
    }, [blockConfig.ports.inputs, id, blockStyle.portSize, handlePortMouseDown, calculateInputPortPosition])

    const outputPorts = useMemo(() => {
        return Array.from({ length: blockConfig.ports.outputs }, (_, index) => {
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
                    onPortMouseDown={onPortMouseDown}
                />
            )
        })
    }, [blockConfig.ports.outputs, id, blockStyle.portSize, onPortMouseDown, calculateOutputPortPosition])

    

    // NOW WE CAN DO EARLY RETURNS AFTER ALL HOOKS ARE DECLARED
    
    // Main Render
    return (
        <>
            <g
                id={`${id}-group`}
                data-block-id={id} 
                transform={`translate(${position.x}, ${position.y})`}
                style={{
                    opacity: ghost ? config.copyOpacity : 1,
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
                            onPortMouseDown={onPortMouseDown}
                        />
                    )
                })}

                {/* Block label */}
                {/* <text
                    x={position.width / 2}
                    y={position.height + 20}
                    textAnchor="middle"
                    fontSize={config.labelFontSize}
                    fontFamily={config.labelFontFamily}
                    fill={config.labelFontColor}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                    {id}
                </text> */}

                {/* <EditableLabel
                    label={id}
                    x={position.width / 2}
                    y={position.height + 20}
                    fontSize={parseInt(config.labelFontSize) || 12}
                    fontFamily={config.labelFontFamily || 'Arial'}
                    fontColor={config.labelFontColor || '#000'}
                    existingNames={allBlocks?.map(b => b.id).filter(blockId => blockId !== id) || []}
                    onLabelChange={(newLabel) => {
                        console.log('Renaming block from', id, 'to', newLabel) // Debug log
                        onRename?.(id, newLabel)
                    }}
                /> */}
{/* 
                {isEditingLabel ? (
                    <foreignObject
                        x={position.width / 2 - calculateInputDimensions(editingLabelText).width / 2}
                        y={position.height + 20 - LABEL_FONT_SIZE / 2} // Match the text y position
                        width={calculateInputDimensions(editingLabelText).width + 10}
                        height={calculateInputDimensions(editingLabelText).height + 10}
                    >
                        <input
                            ref={labelInputRef}
                            type="text"
                            value={editingLabelText}
                            onChange={(e) => setEditingLabelText(e.target.value)}
                            onKeyDown={handleLabelKeyDown}
                            onBlur={handleLabelBlur}
                            autoFocus
                            style={{
                                width: `${calculateInputDimensions(editingLabelText).width}px`,
                                height: '20px',
                                fontSize: `${LABEL_FONT_SIZE}px`,
                                fontFamily: 'Arial',
                                textAlign: 'center',
                                border: '1px solid #333',
                                borderRadius: '2px',
                                padding: '2px 4px',
                                outline: 'none',
                                backgroundColor: 'white',
                                color: '#000',
                                boxSizing: 'border-box'
                            }}
                        />
                    </foreignObject>
                ) : (
                    <text
                        x={position.width / 2}
                        y={position.height + 20}
                        textAnchor="middle"
                        fontSize={config.labelFontSize}
                        fontFamily={config.labelFontFamily}
                        fill={config.labelFontColor}
                        style={{ 
                            userSelect: 'none', 
                            cursor: 'pointer',
                            pointerEvents: 'auto'
                        }}
                        onDoubleClick={handleLabelDoubleClick}
                    >
                        {id}
                    </text>
                )} */}




                // Replace the label section with this simple version that doesn't cause screen jumping:

{isEditingLabel ? (
    <foreignObject
        x={position.width / 2 - Math.max(60, Math.min(150, editingLabelText.length * 8 + 20)) / 2}
        y={position.height + 5}
        width={Math.max(60, Math.min(150, editingLabelText.length * 8 + 20)) + 10}
        height={30}
    >
        <input
            ref={labelInputRef}
            type="text"
            value={editingLabelText}
            onChange={(e) => {
                setEditingLabelText(e.target.value)
            }}
            onKeyDown={(e) => {
                e.stopPropagation()
                
                if (e.key === 'Enter') {
                    e.preventDefault()
                    
                    const newName = editingLabelText.trim()
                    if (newName && newName !== id && onRename) {
                        onRename(id, newName)
                    }
                    setIsEditingLabel(false)
                } else if (e.key === 'Escape') {
                    e.preventDefault()
                    
                    setEditingLabelText(id)
                    setIsEditingLabel(false)
                }
            }}
            onBlur={(e) => {
                e.stopPropagation()
                const newName = editingLabelText.trim()
                if (newName && newName !== id && onRename) {
                    onRename(id, newName)
                }
                setIsEditingLabel(false)
            }}
            autoFocus
            style={{
                width: `${Math.max(60, Math.min(150, editingLabelText.length * 8 + 20))}px`,
                height: '20px',
                fontSize: '12px',
                textAlign: 'center',
                border: '1px solid #333',
                borderRadius: '2px',
                padding: '2px 4px',
                outline: 'none',
                backgroundColor: 'white',
                color: '#000',
                boxSizing: 'border-box'
            }}
        />
    </foreignObject>
) : (
    <text
        x={position.width / 2}
        y={position.height + 20}
        textAnchor="middle"
        fontSize={config.labelFontSize}
        fontFamily={config.labelFontFamily}
        fill={config.labelFontColor}
        style={{ 
            userSelect: 'none', 
            cursor: 'pointer',
            pointerEvents: 'auto'
        }}
        onDoubleClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsEditingLabel(true)
            setEditingLabelText(id)
        }}
    >
        {id}
    </text>
)}

                {/* Resize handles */}
                {showResizeHandles && !isDragging && !isResizing && (
                    <>
                        {/* Northwest resize handle */}
                        <g>
                            {/* Large invisible interactive area */}
                            <rect
                                x={-config.resizeHandleActiveDistance}
                                y={-config.resizeHandleActiveDistance}
                                width={config.resizeHandleActiveDistance + config.resizeHandleSize}
                                height={config.resizeHandleActiveDistance + config.resizeHandleSize}
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
                                x={position.width - config.resizeHandleActiveDistance - config.resizeHandleSize}
                                y={-config.resizeHandleActiveDistance}
                                width={config.resizeHandleActiveDistance + config.resizeHandleSize}
                                height={config.resizeHandleActiveDistance + config.resizeHandleSize}
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
                                x={-config.resizeHandleActiveDistance}
                                y={position.height - config.resizeHandleSize}
                                width={config.resizeHandleActiveDistance + config.resizeHandleSize}
                                height={config.resizeHandleActiveDistance + config.resizeHandleSize}
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
                                x={position.width - config.resizeHandleSize}
                                y={position.height - config.resizeHandleSize}
                                width={config.resizeHandleActiveDistance + config.resizeHandleSize}
                                height={config.resizeHandleActiveDistance +config.resizeHandleSize}
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

// This prevents blocks from re-rendering unless their specific props change
export default memo(Block, (prevProps, nextProps) => {
  // Deep comparison for position values, not object references
  const positionChanged = 
    prevProps.position?.x !== nextProps.position?.x ||
    prevProps.position?.y !== nextProps.position?.y ||
    prevProps.position?.width !== nextProps.position?.width ||
    prevProps.position?.height !== nextProps.position?.height;
  
  const selectionChanged = prevProps.selected !== nextProps.selected;
  const ghostChanged = prevProps.ghost !== nextProps.ghost;
  
  // Also check other props that might cause unnecessary re-renders
  const parametersChanged = 
    JSON.stringify(prevProps.parameters) !== JSON.stringify(nextProps.parameters);
  
  const selectedBlocksChanged = 
    prevProps.selectedBlocks?.length !== nextProps.selectedBlocks?.length ||
    prevProps.selectedBlocks?.some((id, i) => id !== nextProps.selectedBlocks?.[i]);
  
  // Return true if nothing important changed (skip re-render)
  return !positionChanged && !selectionChanged && !ghostChanged && 
         !parametersChanged && !selectedBlocksChanged;
});