import React, { useState, useEffect } from 'react'
import blockConfigManager from '../../../lib/BlockConfigManager'

interface AppInitializerProps {
    children: React.ReactNode
}

export default function AppInitializer({ children }: AppInitializerProps) {
    const [isInitialized, setIsInitialized] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function initializeApp() {
            try {
                console.log('🚀 Initializing app...')
                await blockConfigManager.initialize()
                setIsInitialized(true)
                console.log('✅ App initialized successfully')
            } catch (error) {
                console.error('❌ App initialization failed:', error)
                setError(error instanceof Error ? error.message : 'Unknown error')
            }
        }

        initializeApp()
    }, [])

    if (error) {
        return (
            <div style={{ 
                padding: 40, 
                textAlign: 'center', 
                color: 'red',
                fontFamily: 'monospace'
            }}>
                <h2>❌ Initialization Error</h2>
                <p>{error}</p>
                <button onClick={() => window.location.reload()}>
                    Reload App
                </button>
            </div>
        )
    }

    if (!isInitialized) {
        return (
            <div style={{ 
                padding: 40, 
                textAlign: 'center',
                fontFamily: 'monospace'
            }}>
                <h2>🚀 Loading PathSim...</h2>
                <p>Initializing block configurations...</p>
            </div>
        )
    }

    return <>{children}</>
}