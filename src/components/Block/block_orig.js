/**
 * Block.js
 * 
 * This file defines the Block class and related utilities for the PathSim GUI.
 * Blocks represent functional units in the simulation canvas, supporting drag, resize,
 * selection, parameter editing, port management, and signal connections.
 * 
 * Author: Kevin McBride
 * Last updated: July 2025
 */

/**
 * The minimum snap distance for signal connections (in pixels).
 * @type {number}
 */
const snapDistance = 20;

/**
 * The grid size for block positioning and movement (in pixels).
 * @type {number}
 */
const blockGridSize = 5;

/**
 * Returns the movement distance for grid-based block movement.
 * If shiftKey is true, returns 4x the base grid size.
 * @param {boolean} shiftKey - Whether the shift key is pressed.
 * @returns {number} - Movement distance in pixels.
 */
function getGridMovementDistance(shiftKey = false) {
    const baseGrid = blockGridSize || 5;
    return shiftKey ? baseGrid * 4 : baseGrid;
}

// Make constants and functions globally available
if (typeof window !== 'undefined') {
    window.snapDistance = snapDistance;
    window.blockGridSize = blockGridSize;
    window.getGridMovementDistance = getGridMovementDistance;
}

/**
 * Represents a block on the simulation canvas.
 * Handles rendering, selection, dragging, resizing, ports, signals, and parameter management.
 */
class BlockNew {
    /**
     * Constructs a new Block instance.
     * @param {string} id - Unique block identifier.
     * @param {object} svg - Canvas wrapper object containing the SVG viewport.
     * @param {string|null} blockClass - Block type/class name.
     * @param {number} inPorts - Number of input ports.
     * @param {number} outPorts - Number of output ports.
     * @param {object} position - Initial position and size {x, y, width, height}.
     */
    constructor(id, svg, blockClass=null, inPorts=1, outPorts=1, position={}, isPreview=false) {

        this.selectedBlock = false;
        this.id = id;
        this.blockClass = blockClass;
        this.blockProperties = getBlockDefinition(this.blockClass);
        this.isPreview = isPreview;

        // Position parameters (same as in Simulink)
        if (Object.keys(position).length == 0) {
            this.position = {
                x: 50,
                y: 50,
                width: 100,
                height: 100,
            }
        } else {
            this.position = position
        }

        // Register block in global arrays
        rectangleInstances.push(this);
        if (!this.isPreview) {
            blockInstances[id] = this;
        }

        // Ensure the block is positioned on the grid
        if (typeof snapToGrid === 'function') {
            this.position.x = snapToGrid(this.position.x, blockGridSize);
            this.position.y = snapToGrid(this.position.y, blockGridSize);
            this.position.width = snapToGrid(this.position.width, blockGridSize);
            this.position.height = snapToGrid(this.position.height, blockGridSize);
        }

        // Initialize parameters - there must be a way to load parameters from JSON
        this.parameters = {};

        // Data used in resizing of the block - use the grid-aligned position
        this.rectData = [
            { x: this.position.x, y: this.position.y },  // Top-left corner
            { x: this.position.x + this.position.width, y: this.position.y + this.position.height } // Bottom-right corner
        ];
        
        this.iconElement = null;
        this.inPorts = inPorts;
        this.outPorts = outPorts;
        this.outSignalInstance = [];
        this.inSignalInstance = [];
        this.activeInteraction = false; // Drag/resize flag

        // Double-click detection
        this.lastClickTime = 0;
        this.doubleClickDelay = 300; // ms

        // Canvas SVG reference
        this.parent = svg;

        // Debug: Log block creation
        // console.log(`🧱 Creating block "${this.id}" in:`, this.parent.svg.node());
        // console.log(`🧱 Parent has class:`, this.parent.svg.attr('class'));

        // Create SVG group for block
        this.group = this.parent.svg.append('g')
            .attr('id', `${this.id}-group`)
            .datum({selected: false});

        // console.log(`✅ Block "${this.id}" group created:`, this.group.node());

        // Label configuration
        this.labelOptions = {
            padding: 4,
            labelHeight: 24,
            labelFontSize: "12px",
            labelFontFamily: "sans-serif",
            maxLabelWidth: 10 + this.position.width,
            minLabelWidth: 100,
            currentLabelWidth: 0,
            labelText: this.id,
        };

        // Block styling
        this.blockStyle = {
            fill: 'white',
            stroke: 'black',
            strokeWidth: 1,
        };

        this.selected = false;

        // Create block elements and ports
        this.dragSignalsReal();
        this.createElements();
        this.addPorts();
        this.addSVGIcon();
        this.updateRect();
        this.updateIconPosition();

        // Load JSON-defined parameters if available
        if (typeof blockLibraryLoader !== 'undefined' && blockLibraryLoader && blockLibraryLoader.blockDefinitions) {
            const jsonDef = blockLibraryLoader.getBlockDefinition(this.blockClass);// || this.id); // should be blockClass
            this.jsonDef = jsonDef;
            if (jsonDef) {
                this.loadJSONParameters(jsonDef);
            } else {
                console.log(`📋 No JSON definition found for ${this.blockClass}`);
            }
        // Try to load parameters from the block library
        } else {
            console.log(`⚠️ Block library not ready during construction of ${this.blockClass}, will try to load parameters later`);
            setTimeout(() => {
                this.initializeParametersFromJSON();
            }, 500);
        }

        // Notify backend after block creation
        this.sendToPyWebView();
    }

    /**
     * Gets default parameter values for this block from the JSON definition.
     * @returns {object} Default parameters object.
     */
    getParameterDefaults() {
        // Check if the block library is available and loaded
        if (typeof blockLibraryLoader === 'undefined' || 
            !blockLibraryLoader || 
            !blockLibraryLoader.blockDefinitions || 
            blockLibraryLoader.blockDefinitions.size === 0) {
            console.warn('⚠️ Block library not yet loaded, returning empty defaults');
            return {};
        }
        
        return getBlockParameterDefaults(this.blockClass) || {};
    }

    /**
     * Initializes parameters from JSON defaults, with delayed loading support.
     */
    initializeParametersFromJSON() {
        const tryInitialize = () => {
            const defaults = this.getParameterDefaults();
            if (Object.keys(defaults).length === 0) return false;
            if (!this.parameters) this.parameters = {};
            for (const [paramName, defaultValue] of Object.entries(defaults)) {
                if (this.parameters[paramName] === undefined) {
                    this.parameters[paramName] = defaultValue;
                }
            }
            console.log(`✅ Initialized parameters for ${this.blockClass}:`, this.parameters);
            return true;
        };
        if (tryInitialize()) return;
        setTimeout(() => {
            if (tryInitialize()) return;
            setTimeout(() => {
                if (!tryInitialize()) {
                    console.warn(`⚠️ Could not load parameters for ${this.blockClass} - block library may not be available`);
                }
            }, 1000);
        }, 100);
    }

    /**
     * Sends block creation info to the backend via pywebview, if available. - get rid of the redundant check against the blockClass
     */
    sendToPyWebView() {
        // Only send to backend if the global pywebview object and its API are available
        if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.createInstance === 'function') {
            // Try to get the class name from JSON definition first, fallback to blockClass
            let className = this.blockClass;
            
            if (this.jsonDef && this.jsonDef.class) {
                className = this.jsonDef.class;
                console.log(`🔧 Using JSON class name: ${className} for block ${this.id}`);
            } else if (this.blockProperties && this.blockProperties.class) {
                className = this.blockProperties.class;
                console.log(`🔧 Using block properties class name: ${className} for block ${this.id}`);
            }
            
            console.log(`🔧 Sending block to backend: ID=${this.id}, Class=${className}`);
            window.pywebview.api.createInstance({ id: this.id, class: className });
        } else {
            console.log(`🔧 DEV mode or pywebview not available - skipping backend creation for block: ID=${this.id}, Class=${this.blockClass}`);
        }
    }

    /**
     * Handles single click events for block selection.
     * @param {object} event - Mouse event.
     */
    handleSingleClick(event) {
        // Always handle single click for selection
        if (window.blockSelection) {
            const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
            if (isMultiSelect) {
                window.blockSelection.toggleBlockSelection(this.id);
            } else {
                window.blockSelection.clearSelection();
                window.blockSelection.selectedBlocks.add(this.id);
            }
            window.blockSelection.updateBlockAppearance();
            window.blockSelection.updateSignalAppearance();
            if (window.blockSelection.onSelectionChange) {
                window.blockSelection.onSelectionChange(
                    Array.from(window.blockSelection.selectedBlocks),
                    Array.from(window.blockSelection.selectedSignals)
                );
            }
        }
    }

    /**
     * Handles double-click events for opening parameter or scope windows.
     * Temporarily highlights the block, then clears selection after window opens. - Might not be needed
     * @param {object} event - Mouse event.
     */
    handleDoubleClick(event) {
        console.log('Block double-clicked - opening window');
        
        // Temporarily highlight block for parameter window, but do not leave selected
        // if (window.blockSelection) {
        //     window.blockSelection.clearSelection();
        //     window.blockSelection.selectedBlocks.add(this.id);
        //     window.blockSelection.updateBlockAppearance();
        // } else {
        //     this.selected = true;
        //     d3.select(event.currentTarget).attr('stroke', 'blue');
        // }
        // After opening parameter window, clear selection
        // setTimeout(() => {
        //     if (window.blockSelection) {
        //         window.blockSelection.clearSelection();
        //         window.blockSelection.updateBlockAppearance();
        //     } else {
        //         this.selected = false;
        //         d3.select(event.currentTarget).attr('stroke', 'black');
        //     }
        // }, 300);
        
        // Open parameter window or scope
        if (this.blockClass !== 'Scope') {
            if (typeof openParameterWindow === 'function') {
                openParameterWindow(this);
                // Reset lastClickTime to prevent repeated double-clicks after closing window
                this.lastClickTime = 0;
            } else {
                console.warn('openParameterWindow function not available');
            }
        } else {
            if (typeof openScope === 'function') {
                openScope(this);
                // Reset lastClickTime to prevent repeated double-clicks after closing window
                this.lastClickTime = 0;
            } else {
                console.warn('openScope function not available');
            }
        }
    }

    /**
     * Shows the context menu for the block.
     * @param {object} event - Mouse event.
     * Eventually move this to a global context menu handler
     */
    showContextMenu(event) {
        // Remove any existing context menu
        d3.selectAll('.block-context-menu').remove();
        
        const menu = d3.select('body')
            .append('div')
            .attr('class', 'block-context-menu')
            .style('position', 'absolute')
            .style('left', (event.pageX + 5) + 'px')
            .style('top', (event.pageY + 5) + 'px')
            .style('background', '#2d2d2d')
            .style('border', '1px solid #555')
            .style('border-radius', '4px')
            .style('padding', '5px 0')
            .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)')
            .style('z-index', '1000')
            .style('font-family', 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif')
            .style('font-size', '12px')
            .style('color', '#e0e0e0');
        
        // Add menu items
        const menuItems = [
            { 
                text: this.blockClass === 'Scope' ? 'Open Scope' : 'Parameters...', 
                action: () => {
                    if (this.blockClass !== 'Scope') {
                        openParameterWindow(this);
                    } else {
                        openScope(this);
                    }
                }
            },
            { text: 'Delete Block', action: () => this.deleteBlock() },
            { text: 'Duplicate Block', action: () => this.duplicateBlock() }
        ];
        
        menuItems.forEach(item => {
            menu.append('div')
                .style('padding', '8px 16px')
                .style('cursor', 'pointer')
                .style('hover', 'background-color: #404040')
                .text(item.text)
                .on('mouseover', function() {
                    d3.select(this).style('background-color', '#404040');
                })
                .on('mouseout', function() {
                    d3.select(this).style('background-color', 'transparent');
                })
                .on('click', () => {
                    item.action();
                    d3.selectAll('.block-context-menu').remove();
                });
        });
        
        // Remove menu when clicking elsewhere
        d3.select('body').on('click.context-menu', () => {
            d3.selectAll('.block-context-menu').remove();
            d3.select('body').on('click.context-menu', null);
        });
    }
    
    /**
     * Deletes the block from the canvas and backend.
     * Remove the if else statements since the objects should exist as well as the referenced methods 
     */
    deleteBlock() {
        console.log('Deleting block:', this.id);
        // Add delete functionality
        if (confirm(`Delete block "${this.id}"?`)) {
            // Notify backend before deleting
            this.deleteFromBackend();
            
            this.group.remove();
            
            // Remove from blockInstances if it exists - but is always should be defined
            if (typeof blockInstances !== 'undefined' && blockInstances[this.id]) {
                delete blockInstances[this.id];
            }
            
            // Remove from rectangleInstances array
            if (typeof rectangleInstances !== 'undefined') {
                const index = rectangleInstances.indexOf(this);
                if (index > -1) {
                    rectangleInstances.splice(index, 1);
                }
            }
            
            // Release the block ID for reuse
            if (window.sideNavLibrary && typeof window.sideNavLibrary.releaseBlockId === 'function') {
                window.sideNavLibrary.releaseBlockId(this.id);
            }
        }
    }
    
    /**
     * Deletes the block instance from the backend via pywebview.
     * Only deletes if the global pywebview object and its API are available.
     */
    deleteFromBackend() {
        if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.deleteInstance === 'function') {
            console.log(`🔧 Deleting from backend: ${this.id}`);
            try {
                window.pywebview.api.deleteInstance({ id: this.id });
                console.log(`🗑️ Deleted backend instance: ${this.id}`);
            } catch (error) {
                console.error(`❌ Error deleting from backend: ${error}`);
            }
        } else {
            console.log(`🔧 DEV mode or pywebview not available - skipping backend deletion for: ${this.id}`);
        }
    }
    
    /** TODO: Implement duplicate functionality
     * Duplicates the block instance.
     * This is a placeholder function and needs to be implemented.
     */
    duplicateBlock() {
        console.log('Duplicating block:', this.id);
        // Add duplicate functionality - this would need to be implemented
        alert('Duplicate functionality not yet implemented');
    }


    /**
     * Updates the width of the label box based on the text width.
     * @param {boolean} hasNewPos - Whether the label position has changed.
     * @param {string} [liveText] - Optional live text to measure width against.
     */
    updateLabelWidth(hasNewPos, liveText) {
        // Use provided liveText or default to current label text
        const text = typeof liveText === 'undefined' ? this.labelOptions.labelText : liveText;

        // Compute raw text width, fallback to minimum width if blank
        const rawTextWidth = isBlank(text) ? 2 : this.getTextWidth(text);

        // Calculate the label width, respecting min and max constraints
        const minWidth = this.labelOptions.minLabelWidth + this.labelOptions.padding * 2;
        const maxWidth = this.labelOptions.maxLabelWidth;
        const paddedWidth = rawTextWidth + this.labelOptions.padding * 2;
        const limitLabelLength = Math.min(rawTextWidth, Math.max(minWidth, Math.min(paddedWidth, maxWidth)));

        // Update label width and foreignObject element
        this.labelOptions.currentLabelWidth = limitLabelLength;
        this.labelFO.attr('width', limitLabelLength);

        // Update label position if needed
        if (hasNewPos) this.updateLabelXPosition();
    }

    /**
     * Updates the label's x position based on the block's current position.
     * This centers the label relative to the block's rectangle.
     * It adjusts the x position of the label foreignObject element.
     */
    updateLabelXPosition() {
   
        // Find the x position that centers the label relative to the block
        this.labelFO.attr('x', (this.position.width - this.labelOptions.currentLabelWidth) / 2 - this.labelOptions.padding);
    };

    /**
     * Creates the main block elements including rectangle, shadow, and drag behavior.
     * This method sets up the drag behavior, rectangle appearance, and shadow.
     * It also handles mouse events for selection and drag interactions.
     */
    createElements() {
        // Define the drag behavior and assign a namespace for easier removal
        this.dragBehavior = d3.drag()
            .on('start.drag.myRect', (event) => {
                console.log('🖱️ Drag start detected');
                const [svgX, svgY] = d3.pointer(event, this.parent.svg.node());
                this.dragStartPosition = { x: svgX, y: svgY };
                this.blockStartPosition = { x: this.position.x, y: this.position.y };
                

                if (window.blockSelection && typeof window.blockSelection.getSelectedBlocks === 'function') {
                    window.blockSelection.getSelectedBlocks().forEach(blockId => {
                        const block = blockInstances[blockId];
                        if (block) {
                            block.blockStartPosition = { x: block.position.x, y: block.position.y };
                        }
                    });
                }
                // Don't immediately set activeInteraction or dragStarted
                // Wait to see if there's actual movement
                
                // Handle selection clearing when starting to drag
                if (typeof window !== 'undefined' && window.blockSelection) {
                    const isSelected = window.blockSelection.isBlockSelected(this.id);
                    const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
                    
                    // Only handle selection if this block is not already selected
                    // or if it's a multi-select operation
                    if (!isSelected && !isMultiSelect) {
                        // Clear selection but don't select this block yet
                        // Selection will happen on click-and-release if no dragging occurred
                        window.blockSelection.clearSelection();
                    }
                }
                
                // Record offset between mouse and block's top-left
                this.dragOffset = {
                    x: event.x - this.position.x,
                    y: event.y - this.position.y
                };
            })
            .on('drag.drag.myRect', (event) => {
                // Only set these flags when we detect actual movement
                if (!this.dragStarted && this.dragStartPosition) {
                    const dragDistance = Math.sqrt(
                        Math.pow(event.x - this.dragStartPosition.x, 2) + 
                        Math.pow(event.y - this.dragStartPosition.y, 2)
                    );
                    
                    // Only consider it a drag if movement exceeds threshold
                    if (dragDistance > 3) {
                        console.log('🖱️ Actual drag movement detected');
                        this.activeInteraction = true;
                        this.dragStarted = true;
                    }
                }
                
                // Only call dragR if we're in a real drag
                if (this.dragStarted) {
                    this.dragR(event);
                }
            })
            .on('end.drag.myRect', (event) => {
                this.endDrag(event);
                this.activeInteraction = false;
                this.dragStarted = false;
                this.dragStartPosition = null;

                if (window.blockSelection && typeof window.blockSelection.clearAllBlockStartPositions === 'function') {
                    window.blockSelection.clearAllBlockStartPositions();
                }
            })

        this.group.call(this.dragBehavior)
        // Create a shadow rectangle first (behind the main rectangle)
        const shadowOffset = 3;
        this.shadowElement = this.group.append('rect')
            .attr('class', 'block-shadow-rect')
            .attr('fill', 'rgba(0, 0, 0, 0.3)')
            .attr('stroke', 'none')
            .attr('rx', "2px")
            .attr('x', this.position.x + shadowOffset)
            .attr('y', this.position.y + shadowOffset)
            .attr('width', this.position.width)
            .attr('height', this.position.height);

        // Create the main rectangle and attach the drag behavior,
        // in addition to a mouseleave handler that cancels the drag.
        // Use a function callback (not an arrow) for mouseleave so that we can access "this"
        // from the class instance.
        this.rectangleElement = this.group.append('rect')
            .attr('class', 'rectangle block-shadow')
            .attr('fill', this.blockStyle.fill)
            .attr('stroke', this.blockStyle.stroke)
            .attr('stroke-width', this.blockStyle.strokeWidth)
            .attr('rx', "2px")
            // .call(this.dragBehavior)
            // (Optional) re-enable the drag once the mouse re-enters.
            .on("mouseenter", (event, d) => {
                // console.log("Mouse entered - re-enabling drag behavior.");
                d3.select(event.currentTarget).call(this.dragBehavior);
            });

            this.rectangleElement.on('click', (event) => {
                const currentTime = Date.now();
                const timeSinceLastClick = currentTime - this.lastClickTime;
                
                console.log('🖱️ Block click event', { 
                    timeSinceLastClick, 
                    doubleClickDelay: this.doubleClickDelay,
                    activeInteraction: this.activeInteraction,
                    dragStarted: this.dragStarted 
                });
                
                // Use a small delay to allow drag events to complete
                // This prevents interference between drag and click events
                setTimeout(() => {
                    // Check if we're still in a drag operation after the delay
                    if (this.activeInteraction) {
                        console.log('❌ Click ignored - drag operation in progress after delay');
                        return;
                    }
                    
                    // Check if this is a double-click
                    const newTimeSinceLastClick = currentTime - this.lastClickTime;
                    if (newTimeSinceLastClick < this.doubleClickDelay && this.lastClickTime > 0) {
                        console.log('🖱️ Double-click detected via timing!');
                        this.handleDoubleClick(event);
                        this.lastClickTime = 0; // Reset to prevent triple-click
                        return;
                    }
                    
                    // Store click time for double-click detection
                    this.lastClickTime = currentTime;
                    
                    // Handle single click after additional delay to ensure it's not part of double-click
                    setTimeout(() => {
                        if (Date.now() - this.lastClickTime >= this.doubleClickDelay) {
                            console.log('✅ Processing single click');
                            this.handleSingleClick(event);
                        }
                    }, this.doubleClickDelay);
                    
                }, 10); // Small delay to let drag events complete
                
                event.stopPropagation();
            });

            // Keep the original dblclick handler as backup
            this.rectangleElement.on('dblclick', (event) => {
                console.log('🖱️ Block double-click detected via dblclick event!', event);
                this.handleDoubleClick(event);
                event.stopPropagation();
                event.preventDefault();
            });

            this.rectangleElement.on('contextmenu', (event) => {
                // Right-click for context menu
                // Don't show context menu during Ctrl+click events (reserved for multi-select)
                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                
                event.preventDefault();
                this.showContextMenu(event);
                event.stopPropagation();
            });

        // 3. Function to measure text width using a temporary SVG text element.

        // It gets repositioned in the following code anyway
        this.labelFO = this.group.append('foreignObject')
            .attr('id', `${this.id}-label`)
            .attr('width', this.labelOptions.maxLabelWidth)
            .attr('height', this.labelOptions.labelHeight)
            .style('overflow', 'visible'); // so that the border strokes are fully visible

        // 7. Append a div inside the foreignObject that will serve as the label.
        // Style the div with a light gray dashed border and center text.
        let labelDiv = this.labelFO.append('xhtml:div')
            .html(this.labelOptions.labelText)
            .attr('contenteditable', false) // not editable by default
            // .style('border', '1px dashed lightgray')
            .style('padding', `${this.labelOptions.padding}px`)
            .style('font-size', this.labelOptions.labelFontSize)
            .style('font-family', this.labelOptions.labelFontFamily)
            .style('text-align', 'center')
            .style('background-color', 'none')
            .style('color', 'gray')
            .style('white-space', 'normal')
            .style('word-wrap', 'break-word')
            .style('width', '100%');


        this.updateLabelWidth();

        // 8. On double-click, make the label editable with validation
        labelDiv.on("dblclick", function (event) {
            // Stop event from propagating to block or canvas handlers
            event.stopPropagation();
            event.preventDefault();
            
            d3.select(this).attr('contenteditable', true).node().focus();
        })
        // Update width as user types
        .on("input", (event) => {
            const elem = d3.select(event.currentTarget);
            // Get the text as a single-line string.
            let currentText = elem.text();
            // New strings require new label width and position to be calculated
            this.updateLabelWidth(true, currentText);
        })
        // When the label loses focus, validate and update
        .on("blur", (event, d) => {
            // Select the current element (event.currentTarget)
            const elem = d3.select(event.currentTarget);
        
            // Disable editing.
            elem.attr('contenteditable', false);
        
            // Get the new label text
            let newLabelText = elem.text().trim();
            
            // Validate the new label
            if (this.validateAndUpdateLabel(newLabelText)) {
                // Label was successfully updated
                this.updateLabelWidth(true);
            } else {
                // Reset to current label if validation failed
                elem.text(this.labelOptions.labelText);
                this.updateLabelWidth(true);
            }
        });

        // 9. Add a mouseover handler to change the cursor to pointer when hovering over the label
        const pointsConfig = [
            { index: 0, cursor: "nwse-resize" },
            { index: 1, cursor: "nwse-resize" },
            { index: 2, cursor: "nesw-resize" },
            { index: 3, cursor: "nesw-resize" }
        ];

        // Change this to small squares instead of circles
        this.pointElements = this.group
            .selectAll(".pointC")
            .data(pointsConfig)
            .enter()
            .append("rect")
            .attr("class", "pointC")
            .attr("width", 8)
            .attr("height", 8)
            .attr("fill", "white")
            .attr("stroke", "none")
            .attr("fill-opacity", 0)
            .style("cursor", d => d.cursor)
                // .attr("class", "pointC")
                // .attr("r", 5)
                // .attr("fill", "white")
                // .attr("stroke", "none")
                // .attr("fill-opacity", 0)
                // .style("cursor", d => d.cursor)
                .call(
                    d3.drag()
                        .on("start", (event, d) => {
                            // Use SVG coordinates for pointer
                            const [svgX, svgY] = d3.pointer(event, this.parent.svg.node());
                            this.resizeStartRectData = [
                                { x: this.rectData[0].x, y: this.rectData[0].y },
                                { x: this.rectData[1].x, y: this.rectData[1].y }
                            ];
                            this.resizeStartPointer = { x: svgX, y: svgY };
                        })
                        .on("drag", (event, d) => this.dragCorner(event, d.index))
                )
            .nodes(); // Returns array of DOM nodes

        // Now, when updating positions, wrap with d3.select:

        // This needs to be converted to use rect and not circles with cx and cy
        // and centered on the corners of the rectangle
        const cornerOffset = 4; // Offset for the corners
        this.pointElements.forEach((node, i) => {
            if (!node) return;
            if (i === 0) d3.select(node).attr('x', -cornerOffset).attr('y', -cornerOffset); // Top-left
            if (i === 1) d3.select(node).attr('x', this.position.width - cornerOffset).attr('y', this.position.height - cornerOffset); // Bottom-right
            if (i === 2) d3.select(node).attr('x', -cornerOffset).attr('y', this.position.height - cornerOffset); // Bottom-left
            if (i === 3) d3.select(node).attr('x', this.position.width - cornerOffset).attr('y', -cornerOffset); // Top-right
        });


        this.group
            .on('mouseover', (event) => {
                this.resizeOn();
            })
            .on('mouseleave', (event) => {
                this.resizeOff();
            });
    }


    /**
     * Adds an SVG icon to the block. - This needs a bunch of refactoring
     * @param {number} iconSize - The size of the icon in pixels.
     * @param {string} fillColor - The fill color of the icon.
     */
    addSVGIcon(iconSize = 24, fillColor = 'black') {
        const halfSize = iconSize / 2;

        // Ensure we have block properties and icon path
        if (!this.blockProperties) {
            this.blockProperties = getBlockDefinition(this.blockClass);
        }
        
        if (!this.blockProperties || !this.blockProperties.icon || !this.blockProperties.icon.path) {
            console.warn(`⚠️ No icon path found for ${this.blockClass}, skipping icon creation`);
            return;
        }

        const pathData = this.blockProperties.icon.path;

        this.iconSvgUp = this.group.append('svg')
            .attr('class', 'block-icon')
            .attr('x', (this.position.width - iconSize)/2) // Position near the right edge
            .attr('y', (this.position.height - iconSize)/2) // Position above the bottom edge
            .attr('width', iconSize)
            .attr('height', iconSize)
            .attr('viewBox', `0 0 ${iconSize} ${iconSize}`)
            .style('pointer-events', 'none')

        this.iconSvg = this.iconSvgUp
            .append('path')
            .attr('d', pathData)
            .attr('fill', fillColor);
    }

    /* 
    // Parse the SVG string to extract the path "d" attribute
const parser = new DOMParser();
const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
const pathElement = svgDoc.querySelector("path");
const pathData = pathElement ? pathElement.getAttribute("d") : null;

// Now use D3 to append the icon to your block group
if (pathData) {
    this.group.append("svg")
        .attr("width", 24)
        .attr("height", 24)
        .attr("viewBox", "0 0 24 24")
        .attr("x", (this.position.width - 24) / 2)
        .attr("y", (this.position.height - 24) / 2)
        .append("path")
        .attr("d", pathData)
        .attr("fill", "black");
}
    */

    /**
     * Sets up the drag behavior for signals from outports.
     * This method defines the drag behavior for signals, allowing them to be drawn from outports.
     */
    dragSignalsReal() {

        this.portDragBehavior = d3.drag()
            // .filter(event => {
            //     // Only allow dragging if the mouse is over an outport
            //     return d3.select(event.sourceEvent.target).classed('outPort');
            // })
            .on("start", (event, d) => {
                // Clear any existing block selection when starting to draw a signal
                if (typeof window !== 'undefined' && window.blockSelection) {
                    window.blockSelection.clearSelection();
                }
                
                // Drag a signal from an outport - what can be moved to signal class?
                console.log(d, 'Drag start on outport:', outPortInstances)
                const outPortElem = outPortInstances[d.port.id];
                console.log('Starting signal drag from outport:', outPortElem);
                console.log('id d.portId:', d.id);
                
                // If the outport has the "hasSignal" flag (separate from a signal check so the drag takes place), return to prevent drawing additional signals
                if (outPortElem.hasSignal) return;

                // Get the actual coordinates of the port element (not the mouse event position)
                const portData = outPortElem.port.datum();
                console.log('Port data:', portData);
                const portCoords = {
                    x: this.position.x + portData.x,
                    y: this.position.y + portData.y
                };

                console.log('Port coordinates:', portCoords);
                // Create a new signal instance with side2 offset from side1
                // This ensures the sides start at different positions
                const offset = 0; // Initial offset for side2
                this.currentSignal = new Signal(outPortElem, null, { 
                    x1: portCoords.x, 
                    y1: portCoords.y, 
                    x2: portCoords.x + offset, 
                    y2: portCoords.y 
                }, 'blockPort');
                outPortElem.hasSignal = true;
                outPortElem.signal = this.currentSignal;
                this.outSignalInstance.push(this.currentSignal);
            })
            .on("drag", (event, d) => {
                if (!this.currentSignal) return;

                // Check for snapping to an in-port
                const snapCoords = this.currentSignal.checkSnapOnSignalDrag({ x: this.position.x + event.x, y: this.position.y + event.y }, 'in');

                // Update the signal's endpoint
                this.currentSignal.draggedRight(2, snapCoords);
            })
            .on("end", (event, d) => {
                if (!this.currentSignal) return;

                const snapCoords = this.currentSignal.checkSnapOnSignalDrag({ x: this.position.x + event.x, y: this.position.y + event.y }, 'in');

                if (snapCoords.target) {
                    // Make the snap connection
                    this.currentSignal.makeSnap(snapCoords.target, 'in');
                } else {
                    // If not snapped, keep the signal where it was drawn
                    // Update final coordinates and appearance
                    this.currentSignal.coordinates.end = { x: this.position.x + event.x, y: this.position.y + event.y };
                    this.currentSignal.updatePath();
                    this.currentSignal.updateHandlePositions();
                    this.currentSignal.updateAppearance(); // Will show as red/dashed since not fully connected
                }

                this.currentSignal = null;
            });
    }
    

    /**
     *  Adds inports and outports to the block.
     *  This method creates the inports and outports as SVG circles,
     *  sets their attributes, and adds event listeners for interaction.
     *  It also initializes the Port instances for each port.
     *  The inports are positioned on the left side and outports on the right side
     *  of the block rectangle.
     *  The ports are created with a radius of 5 pixels and a black fill color.
     *  The inports and outports are stored in the block's inPortList and outPortList
     *  respectively, allowing for easy access and management of the ports.
     *  This method is called during the block's initialization to set up the ports.
     *  It uses the d3.js library to create and manipulate the SVG elements.
     *  @returns {void}
     */
    addPorts() {
        this.inPortList = {};
        // Loop through the ports
        for (let i = 0; i < this.inPorts; i++) {

            let portPositionMod = (2*i + 1) * this.position.height / (2*this.inPorts)

            let data = {
                portId: `${this.id}-inPort-${i}`, 
                hasLine: false, 
                snapped: false, 
                currentSignal: null,
                x: this.position.width,
                y: portPositionMod,

            }
            // Create a new Port instance for the inport
            let inPort = new Port(this, data, 'in', i)
            this.inPortList[data.portId] = inPort;
            inPort.portGroup.datum().port = this.inPortList[data.portId];
        };

        // Add outports
        this.outPortList = {};
        // Loop through the ports
        for (let i = 0; i < this.outPorts; i++) {
            let portPositionMod = (2*i + 1) * this.position.height / (2*this.outPorts)

            let data = {
                portId: `${this.id}-outPort-${i}`, 
                hasLine: false, 
                snapped: false, 
                currentSignal: null,
                x: this.position.width,
                y: portPositionMod,
            }
            // Create a new Port instance for the outport
            let outPort = new Port(this, data, 'out', i)
            this.outPortList[data.portId] = outPort;
            outPort.portGroup.datum().port = this.outPortList[data.portId];

            // Set up the drag behavior for the outport
            outPort.portGroup.call(this.portDragBehavior)
                .on("mousedown", (event, data) => {
                    // console.log("clicked on outport"),
                    d3.select(event.currentTarget).call(this.portDragBehavior)
                });
        };
    }

    /**
     * Handles the mouse leave event for the SVG element
     * @param {*} event - The mouse leave event.
    //  */
    svgMouseLeaveHandler(event) {
        if (this.activeInteraction) {
            console.log(this)
            const mouseUpEvent = new MouseEvent("mouseup", {
            view: window,
            bubbles: true,
            cancelable: true
            });
            document.dispatchEvent(mouseUpEvent);
            this.activeInteraction = false;
        }
    }

    /**
     * Enables the resize handles by setting their fill and stroke to visible colors.
     * This method is called when the mouse enters the block area to show the resize handles.
     * It ensures that the resize handles are visible when the user hovers over the block.
     */
    resizeOn() {
        if (window.blockSelection && window.blockSelection.isSelecting) return;
        this.pointElements.forEach(e => d3.select(e)
            .attr('fill', 'white')
            .attr("fill-opacity", 0.8)
            .attr("stroke", "gray"));
    }

    /**
     * Disables the resize handles by setting their fill and stroke to none.
     * This method is called when the mouse leaves the block area to hide the resize handles.
     * It ensures that the resize handles are not visible when not needed.
     */
    resizeOff() {
        if (window.blockSelection && window.blockSelection.isSelecting) return;
        this.pointElements.forEach(e => d3.select(e)
            .attr('fill', 'none')
            .attr("fill-opacity", 0)
            .attr("stroke", "none"));
    }
    /**
     * Updates the positions of the ports on the specified side (in or out).
     * This method recalculates the positions of the ports based on the block's current dimensions
     * and ensures they are grid-aligned. It also updates any connected signals to match the new port positions.
     * @param {string} direction - The direction of the ports ('in' or 'out').
     * This method is called when the block's dimensions change or when ports need to be repositioned.
     */
    updatePortSide(direction) {

        // Can you make a generic signal moving function?
        let numPorts, portList, side, sideName, portType;

        if (direction === 'out') {
            numPorts = this.outPorts;
            portList = this.outPortList;
            side = 1;
            sideName = `side${side}`;
            portType = 'sourcePort';
        } else {
            numPorts = this.inPorts;
            portList = this.inPortList;
            side = 2;
            sideName = `side${side}`;
            portType = 'sinkPort';
        };

        const widthMod = (2 - side) * (this.position.width);

        // Consolidate this into a coherent data structure
        Object.entries(portList).forEach( ([key, obj], i) => {
            // Use your original port spacing equation and then snap to grid
            const gridSize = blockGridSize;

            // ALWAYS start from grid-aligned block position for consistent calculations
            const gridAlignedBlockX = snapToGrid(0, gridSize);
            const gridAlignedBlockY = snapToGrid(0, gridSize);
            const gridAlignedBlockHeight = snapToGrid(this.position.height, gridSize);
            
            // YOUR ORIGINAL PORT SPACING EQUATION - keep the visual distribution you designed
            let portPositionMod = (2*i + 1) * gridAlignedBlockHeight / (2*numPorts);
            
            // Now snap the calculated position to the nearest grid point
            portPositionMod = snapToGrid(portPositionMod, gridSize);

            // Calculate port positions - ensure they're exactly on block edges and grid-aligned
            const portX = gridAlignedBlockX + (direction === 'out' ? snapToGrid(this.position.width, gridSize) : 0);
            const portY = gridAlignedBlockY + portPositionMod;

            // Set the port positions - should already be grid-aligned but double-check
            const newPortXPosition = snapToGrid(portX, gridSize);
            const newPortYPosition = snapToGrid(portY, gridSize);
            try {
                obj.port
                    .attr("transform", `translate(${newPortXPosition}, ${newPortYPosition})`)
                    .datum(Object.assign(obj.port.datum(), { x: newPortXPosition, y: newPortYPosition }));
            } catch (error) {
                console.error("Error setting port position:", error);
            }
            // obj.port
            //     .attr("cx", snapToGrid(portX, gridSize))
            //     .attr("cy", snapToGrid(portY, gridSize))

            // If the port has a signal, the signal needs to be updated as well
            if (obj.signal) {
                // This updates signals that are connected to a block on one side
                const gridAlignedX = this.position.x + +newPortXPosition;
                const gridAlignedY = this.position.y + +newPortYPosition;
                obj.signal.updateSignal(side, {x: gridAlignedX, y: gridAlignedY})
            } else {
                // Run through the unconnected signals and snap one if nearby
                // If the unconnected end comes within snapping distance of an outport
                const gridAlignedPortX = this.position.x + +newPortXPosition;
                const gridAlignedPortY = this.position.y + +newPortYPosition;

                for (const [id, targetSignal] of Object.entries(signalInstances)) {
                    if (targetSignal[portType]) {
                        continue;
                    }
                    // Not sure if this is needed, but it doesn't hurt
                    console.log("checking for snap to target signal", targetSignal, portType)
                    let tx = snapToGrid(parseFloat(targetSignal[sideName].attr('cx')), gridSize);
                    let ty = snapToGrid(parseFloat(targetSignal[sideName].attr('cy')), gridSize);
                    const dSnap = Math.hypot(gridAlignedPortX - tx, gridAlignedPortY - ty);

                    // If target has no signal and the distance is within snap distance...
                    if (!targetSignal[portType] && dSnap < snapDistance) {
                        console.log(targetSignal)
                        // Snap to the target's exact coordinates.
                        let snappedTarget = obj;
                        console.log("the obj is" , obj)
                        const snapPos = {x: gridAlignedPortX, y: gridAlignedPortY, target:snappedTarget};
                        targetSignal.updateSignalEnd(side, snapPos)
                        targetSignal.draggedRight(side, snapPos)
                        // Make the "snap" by updating the port and signal connection values
                        targetSignal.makeSnap(snappedTarget, direction)
                        break;
                    }
                }
            }
        })

    }

    /**
     * Updates the rectangle's position and dimensions based on the current rectData.
     * This method recalculates the rectangle's position, ensures it is grid-aligned,
     * and updates the SVG elements accordingly.
     * It also updates the shadow rectangle, corner points, ports, and label position.
     */
    /**
     * Updates the rectangle's position and dimensions.
     * @param {string} mode - 'move' if updating from position, 'resize' if updating from rectData.
     */
    updateRect(mode = 'move') {

        if (mode === 'move') {
            // Use position as the source of truth
            this.rectData[0].x = this.position.x;
            this.rectData[0].y = this.position.y;
            this.rectData[1].x = this.position.x + this.position.width;
            this.rectData[1].y = this.position.y + this.position.height;
        } else if (mode === 'resize') {
            // Use rectData as the source of truth
            this.position.x = Math.min(this.rectData[0].x, this.rectData[1].x);
            this.position.y = Math.min(this.rectData[0].y, this.rectData[1].y);
            this.position.width = Math.abs(this.rectData[1].x - this.rectData[0].x);
            this.position.height = Math.abs(this.rectData[1].y - this.rectData[0].y);
        }

        // DO NOT snap here!

        this.group.attr('transform', `translate(${this.position.x}, ${this.position.y})`);

        const rect = d3.select(this.rectangleElement.node());

        // Update the shadow rectangle position (offset by shadow amount)
        const shadowOffset = 2;
        if (this.shadowElement) {
            this.shadowElement
                .attr('x', shadowOffset)
                .attr('y', shadowOffset)
                .attr('width', this.position.width)
                .attr('height', this.position.height);
        }

        // Update the SVG block coordinates
        rect.attr('x', 0)
            .attr('y', 0)
            .attr('width', this.position.width)
            .attr('height', this.position.height);

        // Update the block's corner points
        const cornerOffset = 4; // Offset for the corners
        d3.select(this.pointElements[0]).attr('x', -cornerOffset).attr('y', -cornerOffset);
        d3.select(this.pointElements[1]).attr('x', this.position.width - cornerOffset).attr('y', this.position.height - cornerOffset);
        d3.select(this.pointElements[2]).attr('x', -cornerOffset).attr('y', this.position.height - cornerOffset);
        d3.select(this.pointElements[3]).attr('x', this.position.width - cornerOffset).attr('y', -cornerOffset);

        // Update the ports and any signals
        this.updatePortSide('out')
        this.updatePortSide('in')

        this.resizeLabel();
        
        // Update icon position if it exists
        this.updateIconPosition();
        
        // Trigger overlap detection if block selection manager is available
        if (typeof window !== 'undefined' && window.blockSelection && typeof window.blockSelection.checkOverlaps === 'function') {
            window.blockSelection.checkOverlaps();
        }
    }

    /* Handles the rectangle drag operation.
     * This method is called when the rectangle is dragged to update its position.
     * It calculates the new position based on the drag event and updates the rectangle's position.
     * It also handles multi-selection logic if multiple blocks are selected.
     * @param {MouseEvent} event - The mouse event containing the current position.
     */
    dragR(event) {
        if (!this.activeInteraction) this.activeInteraction = true;

        const [svgX, svgY] = d3.pointer(event, this.parent.svg.node());
        let dx = svgX - this.dragStartPosition.x;
        let dy = svgY - this.dragStartPosition.y;

        // Multi-selection logic unchanged
        if (window.blockSelection && window.blockSelection.isBlockSelected(this.id) && window.blockSelection.getSelectedBlocks().length > 1) {
            // console.log("Moving selected blocks");
            window.blockSelection.moveSelectedBlocks(dx, dy, this.id);
            this.position.x = snapToGrid(this.blockStartPosition.x + dx, blockGridSize);
            this.position.y = snapToGrid(this.blockStartPosition.y + dy, blockGridSize);
            this.group.raise();
            this.updateRect('move');
            return;
        }

        // Individual block movement
        this.position.x = snapToGrid(this.blockStartPosition.x + dx, blockGridSize);
        this.position.y = snapToGrid(this.blockStartPosition.y + dy, blockGridSize);
        this.group.raise();
        this.updateRect('move');
    }

    /* Handles the end of the rectangle drag operation.
     * This method is called when the drag operation ends to finalize the rectangle's position.
     * It snaps the rectangle to the grid and ensures it stays within the SVG bounds.
     * @param {MouseEvent} event - The mouse event containing the final position.
     */
    endDrag() {
        
        let origWidth = this.rectData[1].x - this.rectData[0].x;
        let origHeight = this.rectData[1].y - this.rectData[0].y;
        let svgBounds = this.parent.svgBounds();
    
        // Ensure the rectangle stays within the SVG bounds
        if (this.rectData[0].x < 0) {
            this.rectData[0].x = 0;
            this.rectData[1].x = origWidth;
        }
    
        if (this.rectData[0].y < 0) {
            this.rectData[0].y = 0;
            this.rectData[1].y = origHeight;
        }
    
        if (this.rectData[1].x > svgBounds.width) {
            this.rectData[1].x = svgBounds.width;
            this.rectData[0].x = svgBounds.width - origWidth;
        }
    
        if (this.rectData[1].y > svgBounds.height) {
            this.rectData[1].y = svgBounds.height;
            this.rectData[0].y = svgBounds.height - origHeight;
        }
    
        this.updateRect();
    }

    /* LABEL METHODS */

    /**
     *  Updates the label width based on the current text and options.
     *  This method recalculates the label width based on the current text content,
     *  font size, and maximum label width options.
     *  It ensures the label fits within the specified maximum width and updates the label's foreign
     */
    resizeLabel() {
        
        // Resize affects the max width of the label
        this.labelOptions.maxLabelWidth = 1.2*(this.position.width)

        // Updates the label on rect changes
        this.updateLabelWidth(true);

        // Different from label position is to update the vertical position after dragging (remove once in group)
        this.labelFO.attr('y', this.position.height + this.labelOptions.padding);
    }

    /**
     * Updates the label width based on the current text and options.
     * This method recalculates the label width based on the current text content,
     * font size, and maximum label width options.
     * It ensures the label fits within the specified maximum width and updates the label's foreignObject
    */
    getTextWidth(text, fontSize = this.labelOptions.fontSize, fontFamily = this.labelOptions.labelFontFamily) {

        const widthBuffer = 1.2;

        let tempText = d3.select('body').append('svg')
            .append('text')
            .attr('x', -9999)
            .attr('y', -9999)
            .style('font-size', fontSize)
            .style('font-family', fontFamily)
            .text(text);
        let width = tempText.node().getComputedTextLength();
        tempText.remove();
        return widthBuffer * width;
    }

    /* CORNER RESIZE METHODS */

    /**
     * Initializes the locks for the rectangle resizing.
     * This method sets up the locks for the x and y axes to prevent resizing beyond minimum dimensions.
     * It creates an object with properties for each axis, indicating whether it is locked and the position at which it was locked.
     */
    initializeLocks() {
        if (!this.locks) {
        // For each axis we record { isLocked: boolean, lockPos: number }
            this.locks = { 
                x: { isLocked: false, lockPos: null },
                y: { isLocked: false, lockPos: null } 
            };
        }
    }

    /* Handles the corner drag operation for resizing the rectangle.
     * This method is called when a corner point is dragged to resize the rectangle.
     * It calculates the new rectangle dimensions based on the drag event and updates the rectangle's position.
     * It also ensures the rectangle stays within the SVG bounds and snaps to the grid.
     * @param {MouseEvent} event - The mouse event containing the current position.
     * @param {number} index - The index of the corner being dragged (0: top-left, 1: bottom-right, 2: bottom-left, 3: top-right).
     */
    dragCorner(event, index) {
        this.initializeLocks();

        // Get pointer relative to SVG root
        const [pointerX, pointerY] = d3.pointer(event, this.parent.svg.node());
        const minWidth = 40, minHeight = 40;

        // Use rectData for top-left and bottom-right corners
        let startRect = this.resizeStartRectData;
        let dx = pointerX - this.resizeStartPointer.x;
        let dy = pointerY - this.resizeStartPointer.y;

        // Copy initial rectData
        let newRectData = [
            { x: startRect[0].x, y: startRect[0].y },
            { x: startRect[1].x, y: startRect[1].y }
        ];

        // --- Corner logic ---
        if (index === 0) { // top-left
            newRectData[0].x = Math.min(newRectData[0].x + dx, newRectData[1].x - minWidth);
            newRectData[0].y = Math.min(newRectData[0].y + dy, newRectData[1].y - minHeight);
        } else if (index === 1) { // bottom-right
            newRectData[1].x = Math.max(newRectData[1].x + dx, newRectData[0].x + minWidth);
            newRectData[1].y = Math.max(newRectData[1].y + dy, newRectData[0].y + minHeight);
        } else if (index === 2) { // bottom-left
            newRectData[0].x = Math.min(newRectData[0].x + dx, newRectData[1].x - minWidth);
            newRectData[1].y = Math.max(newRectData[1].y + dy, newRectData[0].y + minHeight);
        } else if (index === 3) { // top-right
            newRectData[1].x = Math.max(newRectData[1].x + dx, newRectData[0].x + minWidth);
            newRectData[0].y = Math.min(newRectData[0].y + dy, newRectData[1].y - minHeight);
        }

        // Clamp to SVG bounds
        const svgBounds = this.parent.svgBounds();
        newRectData[0].x = Math.max(0, Math.min(newRectData[0].x, svgBounds.width - minWidth));
        newRectData[0].y = Math.max(0, Math.min(newRectData[0].y, svgBounds.height - minHeight));
        newRectData[1].x = Math.max(minWidth, Math.min(newRectData[1].x, svgBounds.width));
        newRectData[1].y = Math.max(minHeight, Math.min(newRectData[1].y, svgBounds.height));

        // Snap to grid
        newRectData[0].x = snapToGrid(newRectData[0].x, blockGridSize);
        newRectData[0].y = snapToGrid(newRectData[0].y, blockGridSize);
        newRectData[1].x = snapToGrid(newRectData[1].x, blockGridSize);
        newRectData[1].y = snapToGrid(newRectData[1].y, blockGridSize);

        // Update rectData and redraw
        this.rectData[0].x = newRectData[0].x;
        this.rectData[0].y = newRectData[0].y;
        this.rectData[1].x = newRectData[1].x;
        this.rectData[1].y = newRectData[1].y;
        this.updateRect('resize');
    }

    /**
     * Updates the block icon when parameters change
     */
    updateBlockIcon() {
        if (this.blockClass === 'Constant' && typeof updateConstantBlockIcon === 'function') {
            updateConstantBlockIcon(this, this.parameters.value);
        }
    }

    /**
     * Updates the icon position when block is moved or resized
     */
    // Replace the existing updateIconPosition method with this:
    // Replace the updateIconPosition method with this:

    updateIconPosition() {
        if (!this.iconSvg) {
            return;
        }

        const iconSize = 24; // Size of the icon in pixels

        // Calculate centered position within the block
        this.iconSvgUp
            .attr('x', (this.position.width - iconSize)/2) // Position near the right edge
            .attr('y', (this.position.height - iconSize)/2) // Position above the bottom edge

        // Update the SVG icon position using transform instead of x/y attributes
        // console.log('Updating icon position to:', iconX, iconY);
        // this.iconSvgUp
        //     .attr('transform', `translate(${iconX}, ${iconY})`);
    }

    /**
     * Updates block parameters and refreshes icon if needed
     * @param {Object} newParameters - Object containing parameter updates
     */
    updateParameters(newParameters) {
        // Update parameters
        Object.assign(this.parameters, newParameters);
        
        // If this is a Constant block and the value changed, update the icon
        if (this.blockClass === 'Constant' && 'value' in newParameters) {
            this.updateBlockIcon();
            console.log(`📊 Updated ${this.id} value to ${this.parameters.value}`);
        }
    }

    /**
     * Loads parameters from JSON block definition
     * @param {Object} jsonDefinition - JSON definition of the block
     */
    loadJSONParameters(jsonDefinition) {
        if (!jsonDefinition || !jsonDefinition.parameters) {
            return;
        }
        
        console.log(`📋 Loading JSON parameters for ${this.id}:`, jsonDefinition.parameters);
        
        // Initialize parameters object if it doesn't exist
        if (!this.parameters) {
            this.parameters = {};
        }
        
        // Load default values from JSON definition
        for (const [paramName, paramDef] of Object.entries(jsonDefinition.parameters)) {
            if (paramDef.default !== undefined) {
                this.parameters[paramName] = paramDef.default;
                console.log(`  ${paramName}: ${paramDef.default} (${paramDef.description || 'no description'})`);
            }
        }
        
        // Store the parameter definitions for later use in parameter windows
        this.parameterDefinitions = jsonDefinition.parameters;
        
        // Store port labels if available
        if (jsonDefinition.portLabels) {
            this.portLabels = jsonDefinition.portLabels;
        }
        
        // Store block description
        if (jsonDefinition.description) {
            this.description = jsonDefinition.description;
        }
    }
        
    /**
     * Validates and updates the block label.
     * @param {*} newLabelText - The new label text.
     * @returns {boolean} - True if the label was updated successfully, false otherwise.
     */
    validateAndUpdateLabel(newLabelText) {
        // Check if label is empty
        if (!newLabelText || newLabelText.trim() === '') {
            alert('Block label cannot be empty.');
            return false;
        }
        
        // Check if label is the same as current (no change needed)
        if (newLabelText === this.labelOptions.labelText) {
            return true;
        }
        
        // Check if another block already has this label
        if (typeof blockInstances !== 'undefined') {
            for (const [blockId, block] of Object.entries(blockInstances)) {
                if (block !== this && block.labelOptions.labelText === newLabelText) {
                    alert(`Label "${newLabelText}" is already used by another block. Please choose a unique label.`);
                    return false;
                }
            }
        }
        
        // Check if another block already has this as an ID (shouldn't happen with proper ID management)
        if (typeof blockInstances !== 'undefined' && blockInstances[newLabelText] && blockInstances[newLabelText] !== this) {
            alert(`Label "${newLabelText}" conflicts with an existing block ID. Please choose a different label.`);
            return false;
        }
        
        // Update the block ID and label
        this.updateIdAndLabel(newLabelText);
        return true;
    }
    
    /**
     * Updates the block ID and label.
     * @param {*} newLabel - The new label text.
     */
    updateIdAndLabel(newLabel) {
        const oldId = this.id;
        const newId = newLabel;
        
        console.log(`🏷️ Starting updateIdAndLabel: ${oldId} -> ${newId}`);
        
        // IMMEDIATE TEST: Check if backend API is available
        console.log(`🔧 IMMEDIATE API TEST:`);
        console.log(`  typeof pywebview: ${typeof pywebview}`);
        console.log(`  pywebview.api exists: ${!!(pywebview && pywebview.api)}`);
        if (pywebview && pywebview.api) {
            console.log(`  Available API methods: ${Object.keys(pywebview.api)}`);
            console.log(`  updateBlockId method exists: ${typeof pywebview.api.updateBlockId === 'function'}`);
        }
        
        // Update the block ID
        this.id = newId;
        
        // Update the label text
        this.labelOptions.labelText = newLabel;
        
        // Update the group ID
        if (this.group) {
            this.group.attr('id', `${this.id}-group`);
        }
        
        // Update the label foreign object ID
        if (this.labelFO) {
            this.labelFO.attr('id', `${this.id}-label`);
        }
        
        // Update any references in global arrays
        if (typeof blockInstances !== 'undefined' && blockInstances[oldId]) {
            delete blockInstances[oldId];
            blockInstances[newId] = this;
            console.log(`🔄 Updated blockInstances: removed ${oldId}, added ${newId}`);
        }
        
        // Release the old ID from the ID tracker and register the new one
        if (window.sideNavLibrary) {
            if (typeof window.sideNavLibrary.releaseBlockId === 'function') {
                window.sideNavLibrary.releaseBlockId(oldId);
            }
            if (typeof window.sideNavLibrary.registerExistingBlockId === 'function') {
                window.sideNavLibrary.registerExistingBlockId(newId);
            }
        }
        
        // Update port IDs to reflect the new block ID
        console.log(`🔌 Updating port IDs for: ${oldId} -> ${newId}`);
        this.updatePortIds(oldId, newId);
        
        // Update signal connections that reference this block
        console.log(`🔗 Updating signal connections for: ${oldId} -> ${newId}`);
        this.updateSignalConnections(oldId, newId);
        
        // Update the backend registration
        console.log(`🔧 Updating backend registration for: ${oldId} -> ${newId}`);
        this.updateBackendRegistration(oldId, newId);
        
        console.log(`✅ Completed updateIdAndLabel: ${oldId} -> ${newId}`);
    }

    /**
     * Updates port IDs when block ID changes.
     * @param {*} oldId - The old block ID.
     * @param {*} newId - The new block ID.
     */
    updatePortIds(oldId, newId) {
        console.log(`🔌 Starting port ID update for: ${oldId} -> ${newId}`);
        
        // Update input port IDs
        if (this.inPortList) {
            const newInPortList = {};
            for (const [portId, port] of Object.entries(this.inPortList)) {
                const newPortId = portId.replace(oldId, newId);
                port.id = newPortId;
                
                // Check if port has the D3 element (stored as 'port' property, not 'element')
                if (port.port && port.port.attr) {
                    port.port.attr('id', newPortId);
                    
                    // Update the datum if it exists
                    const datum = port.port.datum();
                    if (datum) {
                        datum.portId = newPortId;
                    }
                } else {
                    console.warn(`⚠️ InPort ${portId} has no D3 element to update`);
                }
                
                newInPortList[newPortId] = port;
            }
            this.inPortList = newInPortList;
        }

        // Update output port IDs
        if (this.outPortList) {
            const newOutPortList = {};
            for (const [portId, port] of Object.entries(this.outPortList)) {
                const newPortId = portId.replace(oldId, newId);
                port.id = newPortId;
                
                // Check if port has the D3 element (stored as 'port' property, not 'element')
                if (port.port && port.port.attr) {
                    port.port.attr('id', newPortId);
                    
                    // Update the datum if it exists
                    const datum = port.port.datum();
                    if (datum) {
                        datum.portId = newPortId;
                    }
                } else {
                    console.warn(`⚠️ OutPort ${portId} has no D3 element to update`);
                }
                
                newOutPortList[newPortId] = port;
            }
            this.outPortList = newOutPortList;
        }
        
        console.log(`🔌 Updated port IDs for renamed block: ${oldId} -> ${newId}`);
    }

    /**
     * Updates signal connections when block ID changes.
     * @param {*} oldId - The old block ID.
     * @param {*} newId - The new block ID.
     */
    updateSignalConnections(oldId, newId) {
        let updatedConnections = 0;
        
        console.log(`🔍 Starting signal connection update for: ${oldId} -> ${newId}`);
        console.log(`🔍 Available signal instances:`, Object.keys(signalInstances || {}));
        
        // First, let's see what signals exist BEFORE update
        if (typeof signalInstances !== 'undefined') {
            console.log(`📊 BEFORE UPDATE - All signal connections:`);
            for (const [signalId, signal] of Object.entries(signalInstances)) {
                console.log(`  Signal ${signalId}:`);
                console.log(`    Source: ${signal.sourcePort?.block?.id} (port ${signal.sourcePort?.number})`);
                console.log(`    Sink: ${signal.sinkPort?.block?.id} (port ${signal.sinkPort?.number})`);
            }
        }
        
        // Update all signal instances that reference this block
        if (typeof signalInstances !== 'undefined') {
            for (const [signalId, signal] of Object.entries(signalInstances)) {
                let signalUpdated = false;
                
                console.log(`🔍 Checking signal ${signalId}:`);
                console.log(`  - sourcePort.block.id: ${signal.sourcePort?.block?.id}`);
                console.log(`  - sinkPort.block.id: ${signal.sinkPort?.block?.id}`);
                
                // Update source block reference
                if (signal.sourcePort && signal.sourcePort.block && signal.sourcePort.block.id === oldId) {
                    console.log(`🔄 Updating source block ID: ${oldId} -> ${newId}`);
                    signal.sourcePort.block.id = newId;
                    signalUpdated = true;
                }
                
                // Update sink block reference  
                if (signal.sinkPort && signal.sinkPort.block && signal.sinkPort.block.id === oldId) {
                    console.log(`🔄 Updating sink block ID: ${oldId} -> ${newId}`);
                    signal.sinkPort.block.id = newId;
                    signalUpdated = true;
                }
                
                if (signalUpdated) {
                    updatedConnections++;
                    console.log(`✅ Updated signal connection ${signalId}: block reference ${oldId} -> ${newId}`);
                    
                    // Verify the update
                    console.log(`✅ Verification - signal ${signalId} now has:`);
                    console.log(`  - sourcePort.block.id: ${signal.sourcePort?.block?.id}`);
                    console.log(`  - sinkPort.block.id: ${signal.sinkPort?.block?.id}`);
                } else {
                    console.log(`ℹ️ Signal ${signalId} does not reference block ${oldId}`);
                }
            }
            
            // Show the AFTER state
            console.log(`📊 AFTER UPDATE - All signal connections:`);
            for (const [signalId, signal] of Object.entries(signalInstances)) {
                console.log(`  Signal ${signalId}:`);
                console.log(`    Source: ${signal.sourcePort?.block?.id} (port ${signal.sourcePort?.number})`);
                console.log(`    Sink: ${signal.sinkPort?.block?.id} (port ${signal.sinkPort?.number})`);
            }
        } else {
            console.log(`⚠️ signalInstances is undefined`);
        }
        
        console.log(`🔗 Updated ${updatedConnections} signal connections for renamed block: ${oldId} -> ${newId}`);
    }

    /**
     * Method to update backend registration when block ID changes.
     * Uses the global pywebview object for backend communication.
     * @param {string} oldId - The previous block ID.
     * @param {string} newId - The new block ID.
     */
    updateBackendRegistration(oldId, newId) {
        // Only update backend if the global pywebview object and its API are available
        if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.updateBlockId === 'function') {
            console.log(`🔧 Updating backend registration: ${oldId} -> ${newId}`);
            try {
                const updateData = { oldId, newId };
                console.log(`📤 Calling pywebview.api.updateBlockId with:`, updateData);

                // Call the API and handle the result (supports both sync and async)
                const result = window.pywebview.api.updateBlockId(updateData);

                if (result && typeof result.then === 'function') {
                    result.then(success => {
                        if (success) {
                            console.log(`✅ Successfully updated backend block ID: ${oldId} -> ${newId}`);
                        } else {
                            console.error(`❌ Failed to update backend block ID: ${oldId} -> ${newId}`);
                        }
                    }).catch(error => {
                        console.error(`❌ Error updating backend block ID: ${error}`);
                    });
                } else {
                    // Synchronous result
                    if (result) {
                        console.log(`✅ Successfully updated backend block ID (sync): ${oldId} -> ${newId}`);
                    } else {
                        console.error(`❌ Failed to update backend block ID (sync): ${oldId} -> ${newId}`);
                    }
                }
            } catch (error) {
                console.error(`❌ Error in updateBackendRegistration: ${error}`);
            }
        } else {
            console.log(`ℹ️ pywebview not available - running in DEV mode (backend registration skipped)`);
            console.log(`DEBUG: typeof window.pywebview = ${typeof window.pywebview}`);
            console.log(`DEBUG: window.pywebview.api = ${window.pywebview?.api}`);
        }
    }
}