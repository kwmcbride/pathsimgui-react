import React, { useState, useRef, useCallback } from 'react'

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
}

/**
 * Block component representing a draggable and selectable block on the canvas.
 * Handles mouse events for dragging and selection, and renders resize handles.
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
    const [showResizeHandles, setShowResizeHandles] = useState(false)

    // Drag state refs
    const dragStartRef = useRef({ x: 0, y: 0 })
    const blockStartRef = useRef({ x: 0, y: 0 })
    const isDraggingRef = useRef(false)

    // Block styling
    const blockStyle: BlockStyle = {
        fill: 'white',
        stroke: selected ? 'blue' : 'black',
        strokeWidth: selected ? 2 : 1,
        resizeCornerSize: 8
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
            onMouseEnter={() => !isDragging && setShowResizeHandles(true)}
            onMouseLeave={() => !isDragging && setShowResizeHandles(false)}
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
            {showResizeHandles && !isDragging && (
                <>
                    <rect
                        x={-blockStyle.resizeCornerSize / 2}
                        y={-blockStyle.resizeCornerSize / 2}
                        width={blockStyle.resizeCornerSize}
                        height={blockStyle.resizeCornerSize}
                        fill="white"
                        stroke="gray"
                        style={{ cursor: 'nwse-resize' }}
                    />
                    <rect
                        x={position.width - blockStyle.resizeCornerSize / 2}
                        y={position.height - blockStyle.resizeCornerSize / 2}
                        width={blockStyle.resizeCornerSize}
                        height={blockStyle.resizeCornerSize}
                        fill="white"
                        stroke="gray"
                        style={{ cursor: 'nwse-resize' }}
                    />
                    <rect
                        x={-blockStyle.resizeCornerSize / 2}
                        y={position.height - blockStyle.resizeCornerSize / 2}
                        width={blockStyle.resizeCornerSize}
                        height={blockStyle.resizeCornerSize}
                        fill="white"
                        stroke="gray"
                        style={{ cursor: 'nesw-resize' }}
                    />
                    <rect
                        x={position.width - blockStyle.resizeCornerSize / 2}
                        y={-blockStyle.resizeCornerSize / 2}
                        width={blockStyle.resizeCornerSize}
                        height={blockStyle.resizeCornerSize}
                        fill="white"
                        stroke="gray"
                        style={{ cursor: 'nesw-resize' }}
                    />
                </>
            )}
        </g>
    )
}