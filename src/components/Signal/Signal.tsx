import React, { useCallback, useMemo } from 'react'

/**
 * Represents a point in 2D space
 */
interface Point {
    x: number
    y: number
}

/**
 * Props for the Signal component
 */
interface SignalProps {
    /** Unique identifier for this signal */
    id: string
    /** Starting point (output port) */
    from: Point
    /** Ending point (input port) */
    to: Point
    /** Whether this signal is currently selected */
    selected?: boolean
    /** Whether this signal is being previewed (during connection) */
    preview?: boolean
    /** Signal width (thickness) */
    strokeWidth?: number
    /** Signal color */
    color?: string
    /** Callback when signal is clicked */
    onClick?: (id: string, event: React.MouseEvent) => void
    /** Callback when signal is right-clicked */
    onContextMenu?: (id: string, event: React.MouseEvent) => void
    /** Callback when signal is hovered */
    onHover?: (id: string, hovered: boolean) => void
}

/**
 * Signal component that renders a connection line between two points
 * using modified Manhattan routing to avoid blocks when possible.
 */
export default function Signal({
    id,
    from,
    to,
    selected = false,
    preview = false,
    strokeWidth = 2,
    color = '#4A90E2',
    onClick,
    onContextMenu,
    onHover
}: SignalProps) {
    
    /**
     * Calculate Manhattan-style path with smooth corners
     */
    const calculateManhattanPath = useCallback((start: Point, end: Point): string => {
        const dx = end.x - start.x
        const dy = end.y - start.y
        
        // Minimum segment length for clean routing
        const minSegment = 20
        
        // Calculate waypoints for Manhattan routing
        let waypoints: Point[] = [start]
        
        if (Math.abs(dx) > minSegment && Math.abs(dy) > minSegment) {
            // For longer distances, use proper Manhattan routing
            const midX = start.x + dx * 0.6 // Bias toward horizontal first
            waypoints.push({ x: midX, y: start.y })
            waypoints.push({ x: midX, y: end.y })
        } else if (Math.abs(dx) > Math.abs(dy)) {
            // Primarily horizontal routing
            const midX = start.x + dx * 0.5
            waypoints.push({ x: midX, y: start.y })
            waypoints.push({ x: midX, y: end.y })
        } else {
            // Primarily vertical routing
            const midY = start.y + dy * 0.5
            waypoints.push({ x: start.x, y: midY })
            waypoints.push({ x: end.x, y: midY })
        }
        
        waypoints.push(end)
        
        // Convert waypoints to smooth path with rounded corners
        let pathData = `M ${waypoints[0].x},${waypoints[0].y}`
        
        for (let i = 1; i < waypoints.length - 1; i++) {
            const prev = waypoints[i - 1]
            const current = waypoints[i]
            const next = waypoints[i + 1]
            
            // Calculate corner radius for smooth turns
            const cornerRadius = Math.min(10, 
                Math.abs(current.x - prev.x) / 2,
                Math.abs(current.y - prev.y) / 2,
                Math.abs(next.x - current.x) / 2,
                Math.abs(next.y - current.y) / 2
            )
            
            if (cornerRadius > 0) {
                // Create rounded corner
                const beforeCorner = {
                    x: current.x - Math.sign(current.x - prev.x) * cornerRadius,
                    y: current.y - Math.sign(current.y - prev.y) * cornerRadius
                }
                const afterCorner = {
                    x: current.x + Math.sign(next.x - current.x) * cornerRadius,
                    y: current.y + Math.sign(next.y - current.y) * cornerRadius
                }
                
                pathData += ` L ${beforeCorner.x},${beforeCorner.y}`
                pathData += ` Q ${current.x},${current.y} ${afterCorner.x},${afterCorner.y}`
            } else {
                pathData += ` L ${current.x},${current.y}`
            }
        }
        
        // Line to final point
        const finalPoint = waypoints[waypoints.length - 1]
        pathData += ` L ${finalPoint.x},${finalPoint.y}`
        
        return pathData
    }, [])
    
    /**
     * Generate the path string for the signal line
     */
    const pathData = useMemo(() => {
        return calculateManhattanPath(from, to)
    }, [from, to, calculateManhattanPath])
    
    /**
     * Handle click events
     */
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onClick?.(id, e)
    }, [id, onClick])
    
    /**
     * Handle context menu events
     */
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(id, e)
    }, [id, onContextMenu])
    
    /**
     * Handle mouse enter/leave for hover effects
     */
    const handleMouseEnter = useCallback(() => {
        onHover?.(id, true)
    }, [id, onHover])
    
    const handleMouseLeave = useCallback(() => {
        onHover?.(id, false)
    }, [id, onHover])
    
    /**
     * Calculate visual properties based on state
     */
    const visualProps = useMemo(() => {
        let finalColor = color
        let finalStrokeWidth = strokeWidth
        let opacity = 1
        
        if (preview) {
            opacity = 0.7
            finalColor = '#999'
            finalStrokeWidth = strokeWidth + 1
        } else if (selected) {
            finalColor = '#FF6B35'
            finalStrokeWidth = strokeWidth + 1
        }
        
        return {
            stroke: finalColor,
            strokeWidth: finalStrokeWidth,
            opacity,
            strokeDasharray: preview ? '5,5' : 'none'
        }
    }, [color, strokeWidth, preview, selected])
    
    return (
        <g
            className="signal"
            data-signal-id={id}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: preview ? 'crosshair' : 'pointer' }}
        >
            {/* Invisible thick line for easier clicking */}
            <path
                d={pathData}
                stroke="transparent"
                strokeWidth={Math.max(strokeWidth + 8, 12)}
                fill="none"
                style={{ pointerEvents: preview ? 'none' : 'stroke' }}
            />
            
            {/* Visible signal line */}
            <path
                d={pathData}
                fill="none"
                {...visualProps}
                style={{ 
                    pointerEvents: 'none',
                    transition: preview ? 'none' : 'all 0.15s ease'
                }}
            />
            
            {/* Selection highlight */}
            {selected && (
                <path
                    d={pathData}
                    fill="none"
                    stroke="#FF6B35"
                    strokeWidth={strokeWidth + 4}
                    opacity={0.3}
                    style={{ pointerEvents: 'none' }}
                />
            )}
            
            {/* Direction indicators for completed signals */}
            {!preview && (
                <>
                    {/* Output port indicator */}
                    <circle
                        cx={from.x}
                        cy={from.y}
                        r={2}
                        fill={visualProps.stroke}
                        opacity={visualProps.opacity * 0.8}
                        style={{ pointerEvents: 'none' }}
                    />
                    
                    {/* Input port indicator */}
                    <polygon
                        points={`${to.x - 4},${to.y - 3} ${to.x + 2},${to.y} ${to.x - 4},${to.y + 3}`}
                        fill={visualProps.stroke}
                        opacity={visualProps.opacity}
                        style={{ pointerEvents: 'none' }}
                    />
                </>
            )}
        </g>
    )
}

// Export types for use in other components
export type { SignalProps, Point }