interface MaskConfiguration {
    maskType: string
    version: string
    display: {
        type: 'composite' | 'svg'
        elements: any[]
        svgPath?: string
    }
    parameterBindings: Record<string, any>
    sizing: {
        minWidth: number
        minHeight: number
        defaultWidth: number
        defaultHeight: number
        maintainAspectRatio: boolean
    }
}

/**
 * Manages mask configurations for different block types
 */
class MaskManager {
    private masks: Map<string, MaskConfiguration> = new Map()

    /**
     * Load a mask configuration for a block type
     */
    async loadMaskConfig(blockType: string): Promise<MaskConfiguration | null> {
        try {
            // Check cache first
            if (this.masks.has(blockType)) {
                return this.masks.get(blockType)!
            }

            // Load from file
            const response = await fetch(`/${blockType.toLowerCase()}.mask.json`)
            if (!response.ok) {
                return null
            }

            const config: MaskConfiguration = await response.json()
            this.masks.set(blockType, config)
            return config
        } catch (error) {
            console.warn(`Could not load mask for ${blockType}:`, error)
            return null
        }
    }

    /**
     * Get default size for a block type based on its mask
     */
    async getDefaultSize(blockType: string): Promise<{ width: number; height: number }> {
        const maskConfig = await this.loadMaskConfig(blockType)
        if (maskConfig) {
            return {
                width: maskConfig.sizing.defaultWidth,
                height: maskConfig.sizing.defaultHeight
            }
        }
        return { width: 80, height: 40 }
    }

    /**
     * Check if a block type has a mask configuration
     */
    hasMask(blockType: string): boolean {
        return this.masks.has(blockType)
    }
}

export const maskManager = new MaskManager()
export type { MaskConfiguration }