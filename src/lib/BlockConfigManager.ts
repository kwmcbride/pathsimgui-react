interface BlockParameter {
    name: string
    displayName: string
    type: 'string' | 'number' | 'boolean'
    defaultValue: string | number | boolean
    description?: string
    required?: boolean
    validation?: {
        min?: number
        max?: number
    }
    options?: string[]
}

interface BlockPortConfig {
    inputs: number
    outputs: number
}

interface BlockStyling {
    defaultSize: {
        width: number
        height: number
    }
    color: string
    borderColor: string
    textColor: string
    iconPath?: string
}

interface BlockSimulation {
    canBeSubsystem: boolean
    executionOrder: number
    sampleTime: string
}

export interface BlockConfiguration {
    blockType: string
    displayName: string
    description: string
    pathsimClass: string
    category: string
    ports: BlockPortConfig
    parameters: BlockParameter[]
    styling: BlockStyling
    simulation: BlockSimulation
}

/**
 * Manages block configurations loaded from JSON files
 */
class BlockConfigManager {
    private configurations: Map<string, BlockConfiguration> = new Map()
    private categories: Map<string, string[]> = new Map()

    /**
     * Load a block configuration from a JSON file
     * @param blockType The type of block to load
     * @returns Promise<BlockConfiguration>
     */
    async loadBlockConfig(blockType: string): Promise<BlockConfiguration> {
        try {
            // Check if already loaded
            if (this.configurations.has(blockType)) {
                return this.configurations.get(blockType)!
            }

            // Load from JSON file
            const response = await fetch(`/src/lib/${blockType.toLowerCase()}.json`)
            if (!response.ok) {
                throw new Error(`Failed to load configuration for ${blockType}`)
            }

            const config: BlockConfiguration = await response.json()
            
            // Validate configuration
            this.validateConfiguration(config)
            
            // Store in cache
            this.configurations.set(blockType, config)
            
            // Update categories
            this.updateCategories(config)
            
            return config
        } catch (error) {
            console.error(`Error loading block configuration for ${blockType}:`, error)
            throw error
        }
    }

    /**
     * Load all available block configurations
     */
    async loadAllConfigurations(): Promise<void> {
        // List of available block types - this could be dynamic
        const blockTypes = ['constant', 'gain', 'sum', 'integrator', 'scope']
        
        const loadPromises = blockTypes.map(blockType => 
            this.loadBlockConfig(blockType).catch(error => {
                console.warn(`Could not load ${blockType}:`, error)
                return null
            })
        )
        
        await Promise.all(loadPromises)
    }

    /**
     * Get configuration for a specific block type
     */
    getConfiguration(blockType: string): BlockConfiguration | null {
        return this.configurations.get(blockType) || null
    }

    /**
     * Get all available block types
     */
    getAvailableBlockTypes(): string[] {
        return Array.from(this.configurations.keys())
    }

    /**
     * Get blocks by category
     */
    getBlocksByCategory(category: string): string[] {
        return this.categories.get(category) || []
    }

    /**
     * Get all categories
     */
    getCategories(): string[] {
        return Array.from(this.categories.keys())
    }

    /**
     * Create default parameters for a block type
     */
    createDefaultParameters(blockType: string): BlockParameter[] {
        const config = this.getConfiguration(blockType)
        if (!config) return []

        return config.parameters.map(param => ({
            name: param.name,
            value: param.defaultValue,
            type: param.type,
            description: param.description
        }))
    }

    /**
     * Validate block configuration
     */
    private validateConfiguration(config: BlockConfiguration): void {
        if (!config.blockType || !config.pathsimClass) {
            throw new Error('Block configuration must have blockType and pathsimClass')
        }
        
        if (!config.ports || typeof config.ports.inputs !== 'number' || typeof config.ports.outputs !== 'number') {
            throw new Error('Block configuration must have valid port configuration')
        }
    }

    /**
     * Update categories mapping
     */
    private updateCategories(config: BlockConfiguration): void {
        const category = config.category
        if (!this.categories.has(category)) {
            this.categories.set(category, [])
        }
        this.categories.get(category)!.push(config.blockType)
    }
}

// Export singleton instance
export const blockConfigManager = new BlockConfigManager()