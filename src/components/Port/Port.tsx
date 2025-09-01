import React, { useCallback } from 'react'

interface PortProps {
    blockId: string
    portType: 'input' | 'output'
    portIndex: number
    x: number
    y: number
    size?: number
    onPortMouseDown?: (e: React.MouseEvent, blockId: string, portType: 'input' | 'output', portIndex: number, absolutePos: {x: number, y: number}) => void
}

/**
 * Port component representing an input or output connection point on a block.
 */
export default function Port({
    blockId,
    portType,
    portIndex,
    x,
    y,
    size = 5,
    onPortMouseDown
}: PortProps) {
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        
        // Calculate absolute position of this port in SVG coordinates
        const blockElement = document.getElementById(`${blockId}-group`)
        if (blockElement) {
            const transform = blockElement.getAttribute('transform') || ''
            const matches = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
            if (matches) {
                const blockX = parseFloat(matches[1])
                const blockY = parseFloat(matches[2])
                const absolutePos = {
                    x: blockX + x,
                    y: blockY + y
                }
                onPortMouseDown?.(e, blockId, portType, portIndex, absolutePos)
            }
        }
    }, [blockId, portType, portIndex, x, y, onPortMouseDown])

    const portStyle = {
        fill: portType === 'input' ? 'lightblue' : 'lightcoral',
        stroke: portType === 'input' ? 'blue' : 'red',
        strokeWidth: 1,
        cursor: 'crosshair'
    }

    return (
        <circle
            cx={x}
            cy={y}
            r={size / 2}
            {...portStyle}
             data-port-type={portType}
            data-block-id={blockId}
            data-port-index={portIndex}
            onMouseDown={handleMouseDown}
        />
    )
}