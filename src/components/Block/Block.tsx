import React, { useState, useRef, useCallback, useEffect, memo } from 'react'
import Port from '../Port/Port'
import Mask from '../Mask/Mask'
import { blockConfigManager, BlockConfiguration } from '../../lib/BlockConfigManager'

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
    onParameterChange?: (blockId: string, parameters: BlockParameter[]) => void
    onPositionChange?: (blockId: string, position: Position) => void
    onContextMenu?: (blockId: string, x: number, y: number) => void
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
    onParameterChange,
    onPositionChange,
    onContextMenu
}: BlockProps) {
    // State hooks, these need to be at the top
    
    // Block configuration loaded from JSON
    const [blockConfig, setBlockConfig] = useState<BlockConfiguration | null>(null)

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
    const [selected, setSelected] = useState(false)
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
        const svg = (e.target as SVGElement).ownerSVGElement
        if (!svg) return { x: 0, y: 0 }
        
        const point = svg.createSVGPoint()
        point.x = e.clientX
        point.y = e.clientY
        
        const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse())
        
        return {
            x: svgPoint.x,
            y: svgPoint.y
        }
    }, [])

    /**
     * Handles updates to block parameters from the parameter dialog.
     */
    const handleParameterUpdate = useCallback((newParameters: BlockParameter[]) => {
        setBlockParameters(newParameters)
        onParameterChange?.(id, newParameters)
    }, [id, onParameterChange])

    /**
     * Calculates the position of an input port.
     */
    const getInputPortPosition = useCallback((portIndex: number) => {
        const inPorts = blockConfig?.ports.inputs || 0
        if (inPorts === 0) return { x: 0, y: 0 }
        
        const portSpacing = position.height / (inPorts + 1)
        return {
            x: 0,
            y: portSpacing * (portIndex + 1)
        }
    }, [position.height, blockConfig?.ports.inputs])

    /**
     * Calculates the position of an output port.
     */
    const getOutputPortPosition = useCallback((portIndex: number) => {
        const outPorts = blockConfig?.ports.outputs || 0
        if (outPorts === 0) return { x: 0, y: 0 }
        
        const portSpacing = position.height / (outPorts + 1)
        return {
            x: position.width,
            y: portSpacing * (portIndex + 1)
        }
    }, [position.width, position.height, blockConfig?.ports.outputs])

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

    /**
     * Handles mouse down on a resize handle.
     * Initiates resizing logic for the block.
     */
    const handleResizeMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
        e.stopPropagation()
        
        const svgMousePos = getSVGMousePosition(e)
        
        resizeStartRef.current = svgMousePos
        initialSizeRef.current = { width: position.width, height: position.height }
        resizeHandleRef.current = handle
        setIsResizing(true)
        
        // Mouse move handler for resizing
        const handleResizeMove = (e: MouseEvent) => {
            const currentMouse = getSVGMousePosition(e)
            
            const deltaX = currentMouse.x - resizeStartRef.current.x
            const deltaY = currentMouse.y - resizeStartRef.current.y
            
            let newWidth = initialSizeRef.current.width
            let newHeight = initialSizeRef.current.height
            let newX = position.x
            let newY = position.y
            
            switch (handle) {
                case 'nw':
                    newWidth = Math.max(50, initialSizeRef.current.width - deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height - deltaY)
                    newX = position.x + (initialSizeRef.current.width - newWidth)
                    newY = position.y + (initialSizeRef.current.height - newHeight)
                    break
                case 'ne':
                    newWidth = Math.max(50, initialSizeRef.current.width + deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height - deltaY)
                    newY = position.y + (initialSizeRef.current.height - newHeight)
                    break
                case 'sw':
                    newWidth = Math.max(50, initialSizeRef.current.width - deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height + deltaY)
                    newX = position.x + (initialSizeRef.current.width - newWidth)
                    break
                case 'se':
                    newWidth = Math.max(50, initialSizeRef.current.width + deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height + deltaY)
                    break
            }
            
            const newPosition = {
                ...position,
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight
            }
            handlePositionChange(newPosition)
        }
        
        // Mouse up handler for resizing
        const handleResizeUp = () => {
            setIsResizing(false)
            resizeHandleRef.current = ''
            document.removeEventListener('mousemove', handleResizeMove)
            document.removeEventListener('mouseup', handleResizeUp)
        }
        
        document.addEventListener('mousemove', handleResizeMove)
        document.addEventListener('mouseup', handleResizeUp)
    }, [position, getSVGMousePosition])

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

            // Mouse move handler for dragging
            const handleMouseMove = (e: MouseEvent) => {
                const currentMouse = getSVGMousePosition(e)
                
                const deltaX = currentMouse.x - dragStartRef.current.x
                const deltaY = currentMouse.y - dragStartRef.current.y
                
                const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
                if (dragDistance > 3 && !isDraggingRef.current) {
                    isDraggingRef.current = true
                    setIsDragging(true)
                    // Cancel click detection if drag starts
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current)
                        clickCountRef.current = 0
                    }
                }
                // If dragging, update position
                if (isDraggingRef.current) {
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
                            setSelected(prev => !prev)
                            clickCountRef.current = 0
                        }, 250)
                    } else if (clickCountRef.current === 2) {
                        // Double-click confirmed - add logging back
                        console.log('Double-click detected, opening dialog')
                        console.log('Current blockParameters:', blockParameters)
                        console.log('Current showParameterDialog:', showParameterDialog)
                        setShowParameterDialog(true)
                        // setSelected(true)
                        clickCountRef.current = 0
                    }
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
            e.preventDefault()
            e.stopPropagation()
            
            const svgPoint = getSVGMousePosition(e)
            const startPoint = { x: svgPoint.x, y: svgPoint.y }
            const newDuplicateId = `${blockType.toLowerCase()}_${Date.now()}`
            
            let duplicateElement: SVGGElement | null = null
            let dragThresholdMet = false
            let duplicateCreated = false
            
            const handleRightMouseMove = (e: MouseEvent) => {
                const currentPoint = getSVGMousePosition(e as any)
                const deltaX = currentPoint.x - startPoint.x
                const deltaY = currentPoint.y - startPoint.y
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
                
                // Create duplicate DOM element directly without React
                if (distance > 5 && !dragThresholdMet) {
                    dragThresholdMet = true
                    duplicateCreated = true
                    
                    // Get the original block's SVG element
                    const originalElement = document.getElementById(`${id}-group`)
                    if (originalElement) {
                        // Clone the original element
                        duplicateElement = originalElement.cloneNode(true) as SVGGElement
                        duplicateElement.id = `${newDuplicateId}-group`
                        duplicateElement.style.opacity = '0.7'
                        duplicateElement.style.pointerEvents = 'none'
                        
                        // Add to the same parent (the SVG canvas)
                        originalElement.parentElement?.appendChild(duplicateElement)
                    }
                }
                
                // Update duplicate position by directly manipulating the DOM
                if (duplicateCreated && duplicateElement) {
                    const newX = currentPoint.x - position.width / 2
                    const newY = currentPoint.y - position.height / 2
                    duplicateElement.setAttribute('transform', `translate(${newX}, ${newY})`)
                }
            }
            
            const handleRightMouseUp = (e: MouseEvent) => {
                // Clean up event listeners
                document.removeEventListener('mousemove', handleRightMouseMove)
                document.removeEventListener('mouseup', handleRightMouseUp)
                
                if (duplicateCreated && duplicateElement) {
                    // Get final position from the DOM element
                    const transform = duplicateElement.getAttribute('transform') || ''
                    const matches = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
                    
                    if (matches) {
                        const finalX = parseFloat(matches[1])
                        const finalY = parseFloat(matches[2])
                        
                        // Remove the temporary DOM element
                        duplicateElement.remove()
                        
                        // NOW create the React block with the final position
                        if (onContextMenu) {
                            onContextMenu(`duplicate:${id}:${newDuplicateId}`, finalX + position.width / 2, finalY + position.height / 2)
                        }
                    }
                } else {
                    // Show context menu
                    if (onContextMenu) {
                        onContextMenu(id, e.clientX, e.clientY)
                    }
                }
            }
            
            // Add event listeners
            document.addEventListener('mousemove', handleRightMouseMove)
            document.addEventListener('mouseup', handleRightMouseUp)
        }
    }, [position, getSVGMousePosition, id, blockType, onContextMenu])
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

    // Main Render
    return (
        <>
            <g
                id={`${id}-group`}
                transform={`translate(${position.x}, ${position.y})`}
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
                    const portPos = getInputPortPosition(index)
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
                    const portPos = getOutputPortPosition(index)
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