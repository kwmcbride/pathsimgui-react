import React, { useEffect, useRef } from 'react'
import styles from './ContextMenu.module.css'

interface ContextMenuItem {
    label: string
    action: () => void
    disabled?: boolean
    separator?: boolean
}

interface ContextMenuProps {
    x: number
    y: number
    items: ContextMenuItem[]
    onClose: () => void
    visible: boolean
}

export default function ContextMenu({ x, y, items, onClose, visible }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!visible) return

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose()
            }
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [visible, onClose])

    if (!visible) return null

    return (
        <div
            ref={menuRef}
            className={styles.contextMenu}
            style={{
                position: 'fixed',
                left: x,
                top: y,
                zIndex: 1000
            }}
        >
            {items.map((item, index) => (
                <div key={index}>
                    {item.separator ? (
                        <div className={styles.separator} />
                    ) : (
                        <div
                            className={`${styles.menuItem} ${item.disabled ? styles.disabled : ''}`}
                            onClick={() => {
                                if (!item.disabled) {
                                    item.action()
                                    onClose()
                                }
                            }}
                        >
                            {item.label}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}