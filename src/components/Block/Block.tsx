import React, { useState, useRef, useCallback } from 'react'
import Port from '../Port/Port'

interface Position {
    x: number
    y: number
    width: number
    height: number
}

interface BlockParameter {
    name: string
    value: string | number
    type: 'string' | 'number' | 'boolean'
    description?: string
}

interface BlockProps {
    id: string
    blockClass?: string
    inPorts?: number
    outPorts?: number
    position?: Partial<Position>
    isPreview?: boolean
    parameters?: BlockParameter[]
    onParameterChange?: (blockId: string, parameters: BlockParameter[]) => void
}

interface BlockStyle {
    fill: string
    stroke: string
    strokeWidth: number
    resizeCornerSize: number
    portSize: number
}

/**
 * Block component representing a draggable and selectable block on the canvas.
 * Handles mouse events for dragging, selection, resizing, port connections, and parameter editing.
 */
export default function Block({
    id,
    blockClass = null,
    inPorts = 1,
    outPorts = 1,
    position: initialPosition = {},
    isPreview = false,
    parameters = [],
    onParameterChange
}: BlockProps) {
    // State for block position and dimensions
    const [position, setPosition] = useState<Position>({
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        ...initialPosition
    })

    // State for selection and interaction
    const [selected, setSelected] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    const [showResizeHandles, setShowResizeHandles] = useState(false)
    const [showParameterDialog, setShowParameterDialog] = useState(false)
    const [blockParameters, setBlockParameters] = useState<BlockParameter[]>(
        parameters.length > 0 ? parameters : [
            { name: 'gain', value: 1.0, type: 'number', description: 'Gain factor' },
            { name: 'enabled', value: true, type: 'boolean', description: 'Enable this block' },
            { name: 'name', value: 'test', type: 'string', description: 'Block name' }
        ]
    )

    // Drag state refs
    const dragStartRef = useRef({ x: 0, y: 0 })
    const blockStartRef = useRef({ x: 0, y: 0 })
    const isDraggingRef = useRef(false)
    const clickCountRef = useRef(0)
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    
    // Resize state refs
    const resizeStartRef = useRef({ x: 0, y: 0 })
    const initialSizeRef = useRef({ width: 0, height: 0 })
    const resizeHandleRef = useRef<string>('')

    // Block styling
    const blockStyle: BlockStyle = {
        fill: 'white',
        stroke: selected ? 'blue' : 'black',
        strokeWidth: selected ? 2 : 1,
        resizeCornerSize: 8,
        portSize: 8
    }

    // Shadow offset
    const shadowOffset = 3

    /**
     * Converts screen coordinates to SVG coordinates.
     * @param e Mouse event
     * @returns { x, y } in SVG space
     */
    const getSVGMousePosition = useCallback((e: React.MouseEvent | MouseEvent) => {
        const svg = (e.target as SVGElement).ownerSVGElement
        if (!svg) return { x: 0, y: 0 }
        
        // Create an SVG point and transform it properly
        const point = svg.createSVGPoint()
        point.x = e.clientX
        point.y = e.clientY
        
        // Transform screen coordinates to SVG coordinates
        const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse())
        
        return {
            x: svgPoint.x,
            y: svgPoint.y
        }
    }, [])

    /**
     * Handles parameter updates from the parameter dialog.
     * @param newParameters Updated parameters array
     */
    const handleParameterUpdate = useCallback((newParameters: BlockParameter[]) => {
        setBlockParameters(newParameters)
        onParameterChange?.(id, newParameters)
    }, [id, onParameterChange])

    // /**
    //  * Handles double-click to open parameter dialog.
    //  */
    // const handleDoubleClick = useCallback(() => {
    //     setShowParameterDialog(true)
    //     setSelected(true)
    // }, [])

    /**
     * Calculates the position of input ports along the left edge of the block.
     * @param portIndex Index of the port (0-based)
     * @returns { x, y } position relative to block
     */
    const getInputPortPosition = useCallback((portIndex: number) => {
        const portSpacing = position.height / (inPorts + 1)
        return {
            x: 0,
            y: portSpacing * (portIndex + 1)
        }
    }, [position.height, inPorts])

    /**
     * Calculates the position of output ports along the right edge of the block.
     * @param portIndex Index of the port (0-based)
     * @returns { x, y } position relative to block
     */
    const getOutputPortPosition = useCallback((portIndex: number) => {
        const portSpacing = position.height / (outPorts + 1)
        return {
            x: position.width,
            y: portSpacing * (portIndex + 1)
        }
    }, [position.width, position.height, outPorts])

    /**
     * Handles port mouse down event for connection initiation.
     * @param e Mouse event
     * @param portType 'input' or 'output'
     * @param portIndex Index of the port
     */
    const handlePortMouseDown = useCallback((
        e: React.MouseEvent, 
        blockId: string, 
        portType: 'input' | 'output', 
        portIndex: number
    ) => {
        // TODO: Implement connection logic
        console.log(`Port clicked: ${portType} port ${portIndex} on block ${blockId}`)
    }, [])

    /**
     * Handles resize handle mouse down event.
     * @param e Mouse event
     * @param handle Which handle was clicked ('nw', 'ne', 'sw', 'se')
     */
    const handleResizeMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
        e.stopPropagation()
        
        const svgMousePos = getSVGMousePosition(e)
        
        // Store initial resize state
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
            
            // Apply resize based on which handle is being dragged
            switch (handle) {
                case 'nw': // Top-left
                    newWidth = Math.max(50, initialSizeRef.current.width - deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height - deltaY)
                    newX = position.x + (initialSizeRef.current.width - newWidth)
                    newY = position.y + (initialSizeRef.current.height - newHeight)
                    break
                case 'ne': // Top-right
                    newWidth = Math.max(50, initialSizeRef.current.width + deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height - deltaY)
                    newY = position.y + (initialSizeRef.current.height - newHeight)
                    break
                case 'sw': // Bottom-left
                    newWidth = Math.max(50, initialSizeRef.current.width - deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height + deltaY)
                    newX = position.x + (initialSizeRef.current.width - newWidth)
                    break
                case 'se': // Bottom-right
                    newWidth = Math.max(50, initialSizeRef.current.width + deltaX)
                    newHeight = Math.max(30, initialSizeRef.current.height + deltaY)
                    break
            }
            
            setPosition(prev => ({
                ...prev,
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight
            }))
        }
        
        // Mouse up handler for resizing
        const handleResizeUp = () => {
            setIsResizing(false)
            resizeHandleRef.current = ''
            document.removeEventListener('mousemove', handleResizeMove)
            document.removeEventListener('mouseup', handleResizeUp)
        }
        
        // Attach global listeners
        document.addEventListener('mousemove', handleResizeMove)
        document.addEventListener('mouseup', handleResizeUp)
    }, [position, getSVGMousePosition])

    /**
     * Handles mouse down event to initiate drag or selection.
     * @param e Mouse event
     */
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        
        const svgMousePos = getSVGMousePosition(e)
        
        // Store initial positions
        dragStartRef.current = svgMousePos
        blockStartRef.current = { x: position.x, y: position.y }
        isDraggingRef.current = false

        // Mouse move handler
        const handleMouseMove = (e: MouseEvent) => {
            const currentMouse = getSVGMousePosition(e)
            
            // Calculate movement delta
            const deltaX = currentMouse.x - dragStartRef.current.x
            const deltaY = currentMouse.y - dragStartRef.current.y
            
            // Check if we should start dragging (3px threshold)
            const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
            if (dragDistance > 3 && !isDraggingRef.current) {
                isDraggingRef.current = true
                setIsDragging(true)
                // Cancel any pending click detection when dragging starts
                if (clickTimeoutRef.current) {
                    clearTimeout(clickTimeoutRef.current)
                    clickCountRef.current = 0
                }
            }
            
            // Update position during drag
            if (isDraggingRef.current) {
                setPosition(prev => ({
                    ...prev,
                    x: blockStartRef.current.x + deltaX,
                    y: blockStartRef.current.y + deltaY
                }))
            }
        }

        /**
         * Handles mouse up event to finalize drag or handle clicks.
         */
        const handleMouseUp = () => {
            // Only handle clicks if we didn't drag
            if (!isDraggingRef.current) {
                clickCountRef.current++
                
                if (clickTimeoutRef.current) {
                    clearTimeout(clickTimeoutRef.current)
                }
                
                if (clickCountRef.current === 1) {
                    // Wait to see if this becomes a double-click
                    clickTimeoutRef.current = setTimeout(() => {
                        // Single click confirmed
                        setSelected(prev => !prev)
                        clickCountRef.current = 0
                    }, 250)
                } else if (clickCountRef.current === 2) {
                    // Double-click confirmed - open parameter dialog
                    console.log('Double-click detected, opening dialog')
                    console.log('Current blockParameters:', blockParameters)
                    console.log('Current showParameterDialog:', showParameterDialog)
                    setShowParameterDialog(true)
                    // setSelected(true)
                    clickCountRef.current = 0
                }
            }
            
            // Clean up
            setIsDragging(false)
            isDraggingRef.current = false
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }

        // Attach global listeners
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [position, getSVGMousePosition])

    /**
     * Handles double-click to open parameter dialog.
     * This is kept as a fallback but the main logic is in handleMouseDown
     */
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        // This might not fire reliably in SVG, so we handle it in mousedown/mouseup
    }, [])

    return (
        <>
            <g
                id={`${id}-group`}
                transform={`translate(${position.x}, ${position.y})`}
                onMouseEnter={() => !isDragging && !isResizing && setShowResizeHandles(true)}
                onMouseLeave={() => !isDragging && !isResizing && setShowResizeHandles(false)}
            >
                {/* Shadow rectangle */}
                <rect
                    className="block-shadow-rect"
                    fill="rgba(0, 0, 0, 0.3)"
                    stroke="none"
                    rx="2"
                    x={shadowOffset}
                    y={shadowOffset}
                    width={position.width}
                    height={position.height}
                />

                {/* Main block rectangle */}
                <rect
                    className="rectangle block-shadow"
                    fill={blockStyle.fill}
                    stroke={blockStyle.stroke}
                    strokeWidth={blockStyle.strokeWidth}
                    rx="2"
                    x={0}
                    y={0}
                    width={position.width}
                    height={position.height}
                    style={{ 
                        cursor: isDragging ? 'grabbing' : 'grab',
                        userSelect: 'none'
                    }}
                    onMouseDown={handleMouseDown}
                    // onDoubleClick={handleDoubleClick}
                />

                {/* Block class name inside block */}
                {blockClass && (
                    <text
                        x={position.width / 2}
                        y={position.height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="10"
                        fontFamily="sans-serif"
                        fill="black"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                        {blockClass}
                    </text>
                )}

                {/* Input ports */}
                {Array.from({ length: inPorts }, (_, index) => {
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
                {Array.from({ length: outPorts }, (_, index) => {
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
                        {/* Top-left handle */}
                        <rect
                            x={-blockStyle.resizeCornerSize / 2}
                            y={-blockStyle.resizeCornerSize / 2}
                            width={blockStyle.resizeCornerSize}
                            height={blockStyle.resizeCornerSize}
                            fill="white"
                            stroke="gray"
                            style={{ cursor: 'nwse-resize' }}
                            onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
                        />
                        {/* Top-right handle */}
                        <rect
                            x={position.width - blockStyle.resizeCornerSize / 2}
                            y={-blockStyle.resizeCornerSize / 2}
                            width={blockStyle.resizeCornerSize}
                            height={blockStyle.resizeCornerSize}
                            fill="white"
                            stroke="gray"
                            style={{ cursor: 'nesw-resize' }}
                            onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
                        />
                        {/* Bottom-left handle */}
                        <rect
                            x={-blockStyle.resizeCornerSize / 2}
                            y={position.height - blockStyle.resizeCornerSize / 2}
                            width={blockStyle.resizeCornerSize}
                            height={blockStyle.resizeCornerSize}
                            fill="white"
                            stroke="gray"
                            style={{ cursor: 'nesw-resize' }}
                            onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
                        />
                        {/* Bottom-right handle */}
                        <rect
                            x={position.width - blockStyle.resizeCornerSize / 2}
                            y={position.height - blockStyle.resizeCornerSize / 2}
                            width={blockStyle.resizeCornerSize}
                            height={blockStyle.resizeCornerSize}
                            fill="white"
                            stroke="gray"
                            style={{ cursor: 'nwse-resize' }}
                            onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
                        />
                    </>
                )}
            </g>

            {/* Parameter Dialog */}
            {showParameterDialog && (
                <ParameterDialog
                    blockId={id}
                    blockClass={blockClass}
                    parameters={blockParameters}
                    onParameterUpdate={handleParameterUpdate}
                    onClose={() => setShowParameterDialog(false)}
                />
            )}
        </>
    )
}

/**
 * Parameter Dialog Component for editing block parameters
 */
interface ParameterDialogProps {
    blockId: string
    blockClass?: string
    parameters: BlockParameter[]
    onParameterUpdate: (parameters: BlockParameter[]) => void
    onClose: () => void
}

function ParameterDialog({ 
    blockId, 
    blockClass, 
    parameters, 
    onParameterUpdate, 
    onClose 
}: ParameterDialogProps) {
    const [localParameters, setLocalParameters] = useState<BlockParameter[]>(parameters)

    const handleParameterChange = useCallback((index: number, field: keyof BlockParameter, value: any) => {
        setLocalParameters(prev => 
            prev.map((param, i) => 
                i === index ? { ...param, [field]: value } : param
            )
        )
    }, [])

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
            {blockClass && <p><strong>Type:</strong> {blockClass}</p>}
            
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