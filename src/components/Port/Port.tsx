import React, { useCallback } from 'react'

interface PortProps {
    blockId: string
    portType: 'input' | 'output'
    portIndex: number
    x: number
    y: number
    size?: number
    onPortMouseDown?: (e: React.MouseEvent, blockId: string, portType: 'input' | 'output', portIndex: number) => void
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
        onPortMouseDown?.(e, blockId, portType, portIndex)
    }, [blockId, portType, portIndex, onPortMouseDown])

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
            onMouseDown={handleMouseDown}
        />
    )
}