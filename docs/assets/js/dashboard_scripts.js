

/**
 * AURA-MF Dashboard - Frontend JavaScript
 * ========================================
 * 
 * Purpose: Fetch real-time simulation data from Alwaysdata API
 *          and update dashboard visualizations
 * 
 * Features:
 *   - Automatic data fetching every 2 seconds
 *   - Temperature heatmap visualization
 *   - Fidelity level display with color coding
 *   - Energy balance monitoring
 *   - ML confidence tracking
 *   - Error handling and reconnection logic
 * 
 * Author: AURA-MF Development Team
 * Version: 1.0.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // API Configuration
    API_BASE_URL : 'https://aura-mf-backend.onrender.com',
    INTERVAL: 2000,  // 2 seconds
    
    // Dashboard Element IDs
    ELEMENTS: {
        temperatureCanvas: 'temperatureHeatmap',
        fidelityDisplay: 'fidelityLevel',
        energyResiduals: 'energyResiduals',
        mlConfidence: 'mlConfidence',
        simulationTime: 'simulationTime',
        statusIndicator: 'statusIndicator',
        minTemp: 'minTemp',
        maxTemp: 'maxTemp',
        avgTemp: 'avgTemp',
        fidelityHistory: 'fidelityHistory'
    },
    
    // Visualization Settings
    HEATMAP: {
        colorScheme: 'thermal',  // 'thermal' or 'viridis'
        showGrid: true,
        showValues: false  // Show temperature values on cells
    }
};

async function updateDashboard() {
    const status = document.getElementById('statusIndicator');
    try {
        const res = await fetch(`${API_BASE_URL}/api/simulate`);
        if (!res.ok) throw new Error('Offline');
        const data = await res.json();
        
        status.innerText = "🟢 Connected";
        status.style.color = "#2ecc71";
        // Call your drawing functions here (drawHeatmap, etc.)
    } catch (err) {
        status.innerText = "⏳ Server waking up (30-60s)...";
        status.style.color = "#f1c40f";
    }
}

setInterval(updateDashboard, CONFIG.INTERVAL);
        
// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class DashboardState {
    constructor() {
        this.isConnected = false;
        this.fetchCount = 0;
        this.errorCount = 0;
        this.lastUpdate = null;
        this.currentData = null;
        this.fidelityHistory = [];
    }
    
    recordSuccess(data) {
        this.isConnected = true;
        this.errorCount = 0;
        this.lastUpdate = new Date();
        this.currentData = data;
        this.fetchCount++;
        
        // Track fidelity changes
        if (this.fidelityHistory.length === 0 || 
            this.fidelityHistory[this.fidelityHistory.length - 1] !== data.fidelity_level) {
            this.fidelityHistory.push(data.fidelity_level);
            if (this.fidelityHistory.length > 50) {
                this.fidelityHistory.shift();
            }
        }
    }
    
    recordError() {
        this.isConnected = false;
        this.errorCount++;
    }
}

const dashboardState = new DashboardState();

// ============================================================================
// API COMMUNICATION
// ============================================================================

/**
 * Fetch simulation data from API with timeout
 */
async function fetchSimulationData() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
    
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/simulate`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        dashboardState.recordSuccess(data);
        
        return data;
        
    } catch (error) {
        clearTimeout(timeoutId);
        dashboardState.recordError();
        
        if (error.name === 'AbortError') {
            console.error('Request timeout');
        } else {
            console.error('Fetch error:', error.message);
        }
        
        throw error;
    }
}

async function checkBackend() {
    const statusEl = document.getElementById('statusIndicator');
    try {
        // Ping the health endpoint we set up in the Render guide
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (response.ok) {
            statusEl.innerHTML = "🟢 Connected";
            statusEl.style.color = "#2ecc71";
            startSimulation(); // Function to start your data loop
        }
    } catch (error) {
        statusEl.innerHTML = "⏳ Waking up server (may take 30s)...";
        setTimeout(checkBackend, 5000); // Retry every 5s
    }
}


// ============================================================================
// VISUALIZATION
// ============================================================================

/**
 * Color interpolation for heatmap
 */
function getHeatmapColor(value, min, max, scheme = 'thermal') {
    // Normalize value to 0-1
    const normalized = (value - min) / (max - min);
    
    if (scheme === 'thermal') {
        // Blue → Green → Yellow → Red (thermal scale)
        if (normalized < 0.25) {
            // Blue to Cyan
            const t = normalized * 4;
            return `rgb(${Math.round(0 * (1-t) + 0 * t)}, 
                        ${Math.round(0 * (1-t) + 255 * t)}, 
                        ${Math.round(255 * (1-t) + 255 * t)})`;
        } else if (normalized < 0.5) {
            // Cyan to Green
            const t = (normalized - 0.25) * 4;
            return `rgb(0, 
                        ${Math.round(255)}, 
                        ${Math.round(255 * (1-t) + 0 * t)})`;
        } else if (normalized < 0.75) {
            // Green to Yellow
            const t = (normalized - 0.5) * 4;
            return `rgb(${Math.round(0 * (1-t) + 255 * t)}, 
                        ${Math.round(255)}, 
                        0)`;
        } else {
            // Yellow to Red
            const t = (normalized - 0.75) * 4;
            return `rgb(255, 
                        ${Math.round(255 * (1-t) + 0 * t)}, 
                        0)`;
        }
    }
    
    // Default: Simple blue to red
    return `rgb(${Math.round(normalized * 255)}, 
                0, 
                ${Math.round((1 - normalized) * 255)})`;
}

/**
 * Draw temperature heatmap on canvas
 */
function drawTemperatureHeatmap(canvasId, temperatureField) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element '${canvasId}' not found`);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const gridSize = temperatureField.length;
    
    // Set canvas size
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const cellWidth = canvasWidth / gridSize;
    const cellHeight = canvasHeight / gridSize;
    
    // Find min/max for color scaling
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    
    for (let row of temperatureField) {
        for (let temp of row) {
            minTemp = Math.min(minTemp, temp);
            maxTemp = Math.max(maxTemp, temp);
        }
    }
    
    // Draw cells
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const temp = temperatureField[i][j];
            const color = getHeatmapColor(temp, minTemp, maxTemp, CONFIG.HEATMAP.colorScheme);
            
            // Draw cell
            ctx.fillStyle = color;
            ctx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
            
            // Draw grid lines
            if (CONFIG.HEATMAP.showGrid) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.strokeRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
            }
            
            // Draw temperature values
            if (CONFIG.HEATMAP.showValues) {
                ctx.fillStyle = temp > (minTemp + maxTemp) / 2 ? '#fff' : '#000';
                ctx.font = `${cellWidth * 0.3}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                    temp.toFixed(1),
                    j * cellWidth + cellWidth / 2,
                    i * cellHeight + cellHeight / 2
                );
            }
        }
    }
    
    // Draw color legend
    drawColorLegend(ctx, canvasWidth, canvasHeight, minTemp, maxTemp);
}

/**
 * Draw color legend on canvas
 */
function drawColorLegend(ctx, width, height, minTemp, maxTemp) {
    const legendWidth = 20;
    const legendHeight = height * 0.6;
    const legendX = width - legendWidth - 10;
    const legendY = height * 0.2;
    
    // Draw gradient
    const gradient = ctx.createLinearGradient(legendX, legendY + legendHeight, legendX, legendY);
    gradient.addColorStop(0, getHeatmapColor(minTemp, minTemp, maxTemp));
    gradient.addColorStop(0.5, getHeatmapColor((minTemp + maxTemp) / 2, minTemp, maxTemp));
    gradient.addColorStop(1, getHeatmapColor(maxTemp, minTemp, maxTemp));
    
    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    
    // Draw border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
    
    // Draw labels
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${maxTemp.toFixed(1)}°C`, legendX - 5, legendY);
    ctx.fillText(`${minTemp.toFixed(1)}°C`, legendX - 5, legendY + legendHeight);
}

// ============================================================================
// UI UPDATES
// ============================================================================

/**
 * Update fidelity display with color coding
 */
function updateFidelityDisplay(fidelityLevel, fidelityName) {
    const element = document.getElementById(CONFIG.ELEMENTS.fidelityDisplay);
    if (!element) return;
    
    const colors = ['#4CAF50', '#FF9800', '#F44336'];  // LF=Green, MF=Orange, HF=Red
    const icons = ['⚡', '⚙️', '🔥'];
    
    element.textContent = `${icons[fidelityLevel]} ${fidelityName}`;
    element.style.color = colors[fidelityLevel];
}

/**
 * Update energy residuals display
 */
function updateEnergyResiduals(residuals) {
    const element = document.getElementById(CONFIG.ELEMENTS.energyResiduals);
    if (!element) return;
    
    element.textContent = residuals.toExponential(2);
    
    // Color code based on magnitude
    if (residuals < 1e-4) {
        element.style.color = '#4CAF50';  // Good (green)
    } else if (residuals < 1e-2) {
        element.style.color = '#FF9800';  // Moderate (orange)
    } else {
        element.style.color = '#F44336';  // Poor (red)
    }
}

/**
 * Update ML confidence display
 */
function updateMLConfidence(confidence) {
    const element = document.getElementById(CONFIG.ELEMENTS.mlConfidence);
    if (!element) return;
    
    const percentage = (confidence * 100).toFixed(1);
    element.textContent = `${percentage}%`;
    
    // Color code
    if (confidence > 0.9) {
        element.style.color = '#4CAF50';  // High confidence (green)
    } else if (confidence > 0.8) {
        element.style.color = '#FF9800';  // Moderate (orange)
    } else {
        element.style.color = '#F44336';  // Low (red)
    }
}

/**
 * Update temperature statistics
 */
function updateTemperatureStats(metadata) {
    const elements = {
        min: document.getElementById(CONFIG.ELEMENTS.minTemp),
        max: document.getElementById(CONFIG.ELEMENTS.maxTemp),
        avg: document.getElementById(CONFIG.ELEMENTS.avgTemp)
    };
    
    if (elements.min) elements.min.textContent = `${metadata.min_temp.toFixed(2)}°C`;
    if (elements.max) elements.max.textContent = `${metadata.max_temp.toFixed(2)}°C`;
    if (elements.avg) elements.avg.textContent = `${metadata.avg_temp.toFixed(2)}°C`;
}

/**
 * Update simulation time
 */
function updateSimulationTime(timestamp) {
    const element = document.getElementById(CONFIG.ELEMENTS.simulationTime);
    if (!element) return;
    
    element.textContent = `${timestamp.toFixed(1)}s`;
}

/**
 * Update connection status indicator
 */
function updateStatusIndicator(isConnected) {
    const element = document.getElementById(CONFIG.ELEMENTS.statusIndicator);
    if (!element) return;
    
    if (isConnected) {
        element.textContent = '🟢 Connected';
        element.style.color = '#4CAF50';
    } else {
        element.textContent = '🔴 Disconnected';
        element.style.color = '#F44336';
    }
}

/**
 * Update fidelity history chart (simple text-based)
 */
function updateFidelityHistory() {
    const element = document.getElementById(CONFIG.ELEMENTS.fidelityHistory);
    if (!element || dashboardState.fidelityHistory.length === 0) return;
    
    const symbols = ['▁', '▄', '▇'];  // LF, MF, HF
    const colors = ['#4CAF50', '#FF9800', '#F44336'];
    
    let html = '';
    for (let fidelity of dashboardState.fidelityHistory.slice(-30)) {
        html += `<span style="color: ${colors[fidelity]}">${symbols[fidelity]}</span>`;
    }
    
    element.innerHTML = html;
}

/**
 * Update all dashboard elements
 */
function updateDashboard(data) {
    try {
        // Temperature heatmap
        drawTemperatureHeatmap(CONFIG.ELEMENTS.temperatureCanvas, data.temperature_field);
        
        // Fidelity display
        updateFidelityDisplay(data.fidelity_level, data.fidelity_name);
        
        // Energy residuals
        updateEnergyResiduals(data.energy_residuals);
        
        // ML confidence
        updateMLConfidence(data.ml_confidence);
        
        // Simulation time
        updateSimulationTime(data.timestamp);
        
        // Temperature statistics
        updateTemperatureStats(data.metadata);
        
        // Status indicator
        updateStatusIndicator(true);
        
        // Fidelity history
        updateFidelityHistory();
        
    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

// ============================================================================
// MAIN UPDATE LOOP
// ============================================================================

/**
 * Main update loop - fetches data and updates dashboard
 */
async function updateLoop() {
    try {
        const data = await fetchSimulationData();
        updateDashboard(data);
        
    } catch (error) {
        updateStatusIndicator(false);
        
        // Exponential backoff on errors
        if (dashboardState.errorCount > 5) {
            console.warn('Multiple connection failures. Retrying less frequently...');
            setTimeout(updateLoop, CONFIG.FETCH_INTERVAL * 3);
            return;
        }
    }
    
    // Schedule next update
    setTimeout(updateLoop, CONFIG.FETCH_INTERVAL);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize dashboard when page loads
 */
function initializeDashboard() {
    console.log('🚀 AURA-MF Dashboard initializing...');
    
    // Verify required elements exist
    const requiredElements = [
        CONFIG.ELEMENTS.temperatureCanvas,
        CONFIG.ELEMENTS.fidelityDisplay,
        CONFIG.ELEMENTS.energyResiduals,
        CONFIG.ELEMENTS.mlConfidence
    ];
    
    for (let elementId of requiredElements) {
        if (!document.getElementById(elementId)) {
            console.warn(`Warning: Required element '${elementId}' not found`);
        }
    }
    
    // Set canvas size if exists
    const canvas = document.getElementById(CONFIG.ELEMENTS.temperatureCanvas);
    if (canvas && canvas.width === 0) {
        canvas.width = 400;
        canvas.height = 400;
    }
    
    // Start update loop
    updateLoop();
    
    console.log('✓ Dashboard initialized');
    console.log(`  Fetching from: ${CONFIG.API_BASE_URL}`);
    console.log(`  Update interval: ${CONFIG.FETCH_INTERVAL}ms`);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}

// ============================================================================
// EXPORT FOR TESTING
// ============================================================================

// Make functions available globally for testing
window.AURADashboard = {
    fetchSimulationData,
    updateDashboard,
    dashboardState,
    CONFIG
};

