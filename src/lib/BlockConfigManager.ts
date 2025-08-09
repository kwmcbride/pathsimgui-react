export interface BlockConfiguration {
    blockType: string
    displayName: string
    description: string
    pathsimClass: string
    category: string
    ports: {
        inputs: number
        outputs: number
    }
    parameters: any[]
    styling: {
        defaultSize: {
            width: number
            height: number
        }
        color: string
        borderColor: string
        textColor: string
    }
    simulation: {
        canBeSubsystem: boolean
        executionOrder: number
        sampleTime: string
    }
}

class BlockConfigManager {
    private configurations = new Map<string, BlockConfiguration>()
    private isInitialized = false

    async initialize(): Promise<void> {
        if (this.isInitialized) return

        // List all your block types here
        const blockTypes = ['gain', 'constant'] //, 'sum', 'integrator', 'scope']
        
        const loadPromises = blockTypes.map(async (blockType) => {
    try {
        const url = `/lib/${blockType.toLowerCase()}.json`
        console.log(`🔍 Trying to fetch: ${url}`)
        
        const response = await fetch(url)
        console.log(`📡 Response for ${blockType}:`, response.status, response.statusText)
        
        if (response.ok) {
            const text = await response.text()
            console.log(`📄 Raw response for ${blockType}:`, text.substring(0, 100))
            
            const config: BlockConfiguration = JSON.parse(text)
            this.configurations.set(blockType, config)
            console.log(`✓ Loaded config for ${blockType}`)
        } else {
            console.warn(`❌ Could not load ${blockType}.json - Status: ${response.status}`)
            this.configurations.set(blockType, this.createFallbackConfig(blockType))
        }
    } catch (error) {
        console.warn(`💥 Error loading ${blockType}:`, error)
        this.configurations.set(blockType, this.createFallbackConfig(blockType))
    }
})
        
        await Promise.all(loadPromises)
        this.isInitialized = true
        console.log('✓ BlockConfigManager initialized')
    }

    private createFallbackConfig(blockType: string): BlockConfiguration {
        return {
            blockType,
            displayName: blockType,
            description: '',
            pathsimClass: '',
            category: 'basic',
            ports: { inputs: 1, outputs: 1 },
            parameters: [],
            styling: {
                defaultSize: { width: 100, height: 60 },
                color: '#f0f0f0',
                borderColor: '#ccc',
                textColor: '#333'
            },
            simulation: {
                canBeSubsystem: false,
                executionOrder: 1,
                sampleTime: '0.1'
            }
        }
    }

    getConfiguration(blockType: string): BlockConfiguration | null {
        return this.configurations.get(blockType) || null
    }

    isReady(): boolean {
        return this.isInitialized
    }
}

const blockConfigManager = new BlockConfigManager()
export default blockConfigManager