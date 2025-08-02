/**
 * Utility functions for working with grids in the canvas
 */
// src/utilities/grid.js

// Default grid size
export const GRID_SIZE = 5; // Default grid size

// Grid snapping function
export function snapToGrid(rawPosition, gridSize = GRID_SIZE) {
    return Math.round(rawPosition / gridSize) * gridSize;
}