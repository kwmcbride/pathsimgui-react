import React, { useState, useRef, useCallback } from 'react'
import Port from '../Port/Port'

interface Position {
    x: number
    y: number
    width: number
    height: number
}

interface BlockProps {
    id: string
    blockClass?: string
    inPorts?: number
    outPorts?: number
    position?: Partial<Position>
    isPreview?: boolean
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
 * Handles mouse events for dragging, selection, resizing, and port connections.
 */
export default function Block({
    id,
    blockClass = null,
    inPorts = 1,
    outPorts = 1,
    position: initialPosition = {},
    isPreview = false
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

    // Drag state refs
    const dragStartRef = useRef({ x: 0, y: 0 })
    const blockStartRef = useRef({ x: 0, y: 0 })
    const isDraggingRef = useRef(false)
    
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
         * Handles mouse up event to finalize drag or toggle selection.
         */
        const handleMouseUp = () => {
            // Handle click vs drag
            if (!isDraggingRef.current) {
                setSelected(prev => !prev)
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

    return (
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
            />

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
    )
}