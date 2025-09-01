import React, { useState, useEffect } from 'react'
import { maskManager, type MaskConfiguration } from '../../lib/MaskConfigManager'

/**
 * Represents a display element in the mask
 */
interface MaskElement {
    type: 'rectangle' | 'circle' | 'text' | 'path' | 'line'
    x: string | number
    y: string | number
    width?: string | number
    height?: string | number
    radius?: string | number
    text?: string
    fontSize?: string | number
    fontFamily?: string
    fontWeight?: string
    textAnchor?: 'start' | 'middle' | 'end'
    fill?: string
    stroke?: string
    strokeWidth?: number
    rx?: number
    ry?: number
    path?: string
    x1?: string | number
    y1?: string | number
    x2?: string | number
    y2?: string | number
    useShadow?: boolean
}

/**
 * Block parameter interface
 */
interface BlockParameter {
    name: string
    value: string | number | boolean
    type: 'string' | 'number' | 'boolean'
    description?: string
}

/**
 * Props for the Mask component
 */
interface MaskProps {
    blockType: string
    parameters: BlockParameter[]
    width: number
    height: number
    selected?: boolean
}

/**
 * Mask component that renders the visual appearance of a block
 * based on its mask configuration and current parameter values.
 */
export default function Mask({ 
    blockType, 
    parameters, 
    width, 
    height, 
    selected = false 
}: MaskProps) {
    const [maskConfig, setMaskConfig] = useState<MaskConfiguration | null>(null)
    const [loading, setLoading] = useState(true)

    /**
     * Load mask configuration from JSON file
     */
    useEffect(() => {
        const loadMaskConfig = async () => {
            try {
                setLoading(true)
                const config = await maskManager.loadMaskConfig(blockType)
                setMaskConfig(config)
            } catch (error) {
                console.warn(`No mask configuration found for ${blockType}:`, error)
                setMaskConfig(null)
            } finally {
                setLoading(false)
            }
        }
        loadMaskConfig()
    }, [blockType])

    /**
     * Convert percentage or relative values to absolute pixels
     */
    const resolveValue = (value: string | number, dimension: 'width' | 'height'): number => {
        if (typeof value === 'number') return value
        
        const maxValue = dimension === 'width' ? width : height
        
        if (value.endsWith('%')) {
            const percentage = parseFloat(value.replace('%', ''))
            return (percentage / 100) * maxValue
        }
        
        return parseFloat(value) || 0
    }

    /**
     * Resolve font size as percentage of block height or absolute value
     */
    const resolveFontSize = (fontSize: string | number): number => {
        if (typeof fontSize === 'number') return fontSize
        
        if (fontSize.endsWith('%')) {
            const percentage = parseFloat(fontSize.replace('%', ''))
            return (percentage / 100) * height
        }
        
        return parseFloat(fontSize) || 12
    }

    /**
     * Scale path coordinates to fit the current block size
     * Properly handles both X and Y coordinates in SVG path strings
     */
    const scalePath = (path: string): string => {
        // Split path into commands and coordinates
        const pathCommands = path.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || []
        
        return pathCommands.map(command => {
            const commandLetter = command[0]
            const coords = command.slice(1).trim()
            
            if (!coords) return commandLetter
            
            // Split coordinates and process pairs
            const numbers = coords.split(/[\s,]+/).filter(n => n.length > 0)
            const scaledNumbers = []
            
            for (let i = 0; i < numbers.length; i += 2) {
                const xValue = numbers[i]
                const yValue = numbers[i + 1]
                
                // Scale X coordinate
                if (xValue) {
                    if (xValue.endsWith('%')) {
                        const percentage = parseFloat(xValue.replace('%', ''))
                        scaledNumbers.push((percentage / 100) * width)
                    } else {
                        scaledNumbers.push(parseFloat(xValue))
                    }
                }
                
                // Scale Y coordinate
                if (yValue) {
                    if (yValue.endsWith('%')) {
                        const percentage = parseFloat(yValue.replace('%', ''))
                        scaledNumbers.push((percentage / 100) * height)
                    } else {
                        scaledNumbers.push(parseFloat(yValue))
                    }
                }
            }
            
            return commandLetter + ' ' + scaledNumbers.join(' ')
        }).join(' ')
    }

    /**
     * Replace parameter placeholders in text with actual values
     */
    const interpolateText = (text: string): string => {
        console.log('=== interpolateText Debug ===')
        console.log('blockType:', blockType)
        console.log('text to interpolate:', text)
        console.log('parameters:', parameters)
        console.log('maskConfig?.parameterBindings:', maskConfig?.parameterBindings)
        
        return text.replace(/\$\{(\w+)\}/g, (match, paramName) => {
            console.log(`Looking for parameter: ${paramName}`)
            
            const param = parameters.find(p => p.name === paramName)
            console.log(`Found parameter:`, param)
            
            if (!param) {
                console.log(`Parameter ${paramName} not found, returning: ${match}`)
                return match
            }

            const binding = maskConfig?.parameterBindings[paramName]
            console.log(`Parameter binding for ${paramName}:`, binding)
            
            if (!binding) {
                console.log(`No binding found, returning value: ${String(param.value)}`)
                return String(param.value)
            }

            // ... rest of the binding logic
            switch (binding.displayFormat) {
                case 'number':
                    const numValue = Number(param.value)
                    const precision = binding.precision ?? 3
                    const formatted = numValue.toFixed(precision).replace(/\.?0+$/, '')
                    return binding.showUnits && binding.unit ? `${formatted} ${binding.unit}` : formatted
                    
                case 'boolean':
                    const boolValue = Boolean(param.value)
                    return boolValue ? (binding.trueText ?? 'True') : (binding.falseText ?? 'False')
                    
                default:
                    return String(param.value)
            }
        })
    }

    /**
     * Generate a unique shadow filter ID for this mask instance
     */
    const shadowFilterId = `shadow-${blockType}-${Math.random().toString(36).substr(2, 9)}`

    /**
     * Render a single mask element
     */
    const renderElement = (element: MaskElement, index: number) => {
        const x = resolveValue(element.x, 'width')
        const y = resolveValue(element.y, 'height')

        // Common props for elements that support shadows
        const shadowProps = element.useShadow ? { filter: `url(#${shadowFilterId})` } : {}

        switch (element.type) {
            case 'rectangle':
                return (
                    <rect
                        key={index}
                        x={x}
                        y={y}
                        width={resolveValue(element.width || width, 'width')}
                        height={resolveValue(element.height || height, 'height')}
                        fill={element.fill || 'white'}
                        stroke={selected ? '#007bff' : (element.stroke || 'black')}
                        strokeWidth={selected ? 5 : (element.strokeWidth || 1)}
                        rx={element.rx || 0}
                        ry={element.ry || 0}
                        {...shadowProps}
                    />
                )

            case 'text':
                return (
                    <text
                        key={index}
                        x={x}
                        y={y}
                        fontSize={resolveFontSize(element.fontSize || 12)}
                        fontFamily={element.fontFamily || 'Arial, sans-serif'}
                        fontWeight={element.fontWeight || 'normal'}
                        textAnchor={element.textAnchor || 'start'}
                        fill={element.fill || 'black'}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                        dominantBaseline="middle"
                    >
                        {element.text ? interpolateText(element.text) : ''}
                    </text>
                )

            case 'path':
                return (
                    <path
                        key={index}
                        d={scalePath(element.path || '')}
                        fill={element.fill || 'none'}
                        stroke={selected ? '#007bff' : (element.stroke || 'black')}
                        strokeWidth={selected ? 5 : (element.strokeWidth || 1)}
                        transform={`translate(${x}, ${y})`}
                        {...shadowProps}
                    />
                )

            default:
                return null
        }
    }

    // Show loading state
    if (loading) {
        return (
            <rect
                width={width}
                height={height}
                fill="#f0f0f0"
                stroke="#ccc"
                rx={2}
            />
        )
    }

    // Fallback if no mask configuration
    if (!maskConfig) {
        return (
            <>
                <rect
                    width={width}
                    height={height}
                    fill="white"
                    stroke={selected ? '#007bff' : 'black'}
                    strokeWidth={selected ? 5 : 1}
                    rx={2}
                />
                <text
                    x={width / 2}
                    y={height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                    fontFamily="Arial, sans-serif"
                    fill="black"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                    {blockType}
                </text>
            </>
        )
    }

    // Check if any elements use shadows
    const usesShadow = maskConfig.display.elements.some(element => element.useShadow) || false

    // Render mask elements from configuration
    return (
        <>
            {/* Invisible background rectangle for mouse events */}
            <rect
                width={width}
                height={height}
                fill="transparent"
                stroke="none"
                style={{ pointerEvents: 'all' }}
            />


            {/* Define shadow filter if needed */}
            {usesShadow && (
                <defs>
                    <filter id={shadowFilterId} x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow
                            dx="3"
                            dy="3"
                            stdDeviation="2"
                            floodOpacity="0.3"
                            floodColor="black"
                        />
                    </filter>
                </defs>
            )}
            
            {maskConfig.display.elements.map((element, index) => 
                renderElement(element, index)
            )}
        </>
    )
}