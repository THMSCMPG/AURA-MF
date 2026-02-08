/**
 * AURA-MF Client-Side Physics Engine
 * ===================================
 * Complete simulation engine running entirely in the browser
 * 
 * Features:
 * - 2D thermal solver with finite-difference methods
 * - BTE (Boltzmann Transport Equation) drift-diffusion solver
 * - Navier-Stokes fluid dynamics with buoyancy
 * - Canvas-based visualization with multiple colormaps
 */

'use strict';

// ============================================================================
// AURA PHYSICS SOLVER - 2D Thermal Solver
// ============================================================================

class AURAPhysicsSolver {
    constructor() {
        // Physical constants
        this.SIGMA = 5.67e-8;      // Stefan-Boltzmann constant (W/m²/K⁴)
        this.RHO = 2400;           // Density (kg/m³)
        this.CP = 900;             // Specific heat (J/kg/K)
        this.H_BASE = 10;          // Base convection coefficient (W/m²/K)
        this.H_WIND = 5;           // Wind convection coefficient (W/m²/K)
        this.T_SKY_OFF = 10;       // Sky temperature offset (K)
        this.BETA = 0.004;         // Temperature coefficient (1/K)
        this.T_REF = 298.15;       // Reference temperature (K)
        
        // Grid parameters
        this.NX = 20;
        this.NY = 20;
        this.DX = 0.1;  // meters
        this.DT = 0.1;  // seconds
        
        // Fidelity levels: [Low, Medium, High]
        this.STEPS_PER_FIDELITY = [5, 20, 100];
        
        this.temperatureField = null;
        this.initializeGrid();
    }
    
    initializeGrid() {
        const size = this.NX * this.NY;
        this.temperatureField = new Float64Array(size);
        // Initialize to ambient temperature
        this.temperatureField.fill(298.15);
    }
    
    solve(params, fidelityLevel) {
        const steps = this.STEPS_PER_FIDELITY[fidelityLevel];
        const {
            solarIrradiance = 1000,
            ambientTemp = 298.15,
            windSpeed = 2.0,
            absorptivity = 0.9,
            emissivity = 0.9,
            thermalConductivity = 200,
            thickness = 0.005
        } = params;
        
        const alpha = thermalConductivity / (this.RHO * this.CP);
        const tSky = ambientTemp - this.T_SKY_OFF;
        const hConv = this.H_BASE + this.H_WIND * Math.sqrt(windSpeed);
        
        // Time-stepping loop
        for (let step = 0; step < steps; step++) {
            const newTemp = new Float64Array(this.temperatureField.length);
            
            for (let j = 0; j < this.NY; j++) {
                for (let i = 0; i < this.NX; i++) {
                    const idx = j * this.NX + i;
                    const T = this.temperatureField[idx];
                    
                    // Laplacian with Neumann boundary conditions
                    let laplacian = 0;
                    let count = 0;
                    
                    // Left neighbor
                    if (i > 0) {
                        laplacian += this.temperatureField[idx - 1];
                        count++;
                    } else {
                        laplacian += T; // Neumann BC
                        count++;
                    }
                    
                    // Right neighbor
                    if (i < this.NX - 1) {
                        laplacian += this.temperatureField[idx + 1];
                        count++;
                    } else {
                        laplacian += T; // Neumann BC
                        count++;
                    }
                    
                    // Bottom neighbor
                    if (j > 0) {
                        laplacian += this.temperatureField[idx - this.NX];
                        count++;
                    } else {
                        laplacian += T; // Neumann BC
                        count++;
                    }
                    
                    // Top neighbor
                    if (j < this.NY - 1) {
                        laplacian += this.temperatureField[idx + this.NX];
                        count++;
                    } else {
                        laplacian += T; // Neumann BC
                        count++;
                    }
                    
                    laplacian = (laplacian - count * T) / (this.DX * this.DX);
                    
                    // Heat fluxes
                    const qConv = hConv * (T - ambientTemp);
                    const qRad = emissivity * this.SIGMA * (Math.pow(T, 4) - Math.pow(tSky, 4));
                    const qSolar = absorptivity * solarIrradiance;
                    
                    // Net surface flux
                    const qNetSurface = qSolar - qConv - qRad;
                    
                    // Temperature update
                    const dT = (qNetSurface / (this.RHO * this.CP * thickness) + alpha * laplacian) * this.DT;
                    newTemp[idx] = T + dT;
                }
            }
            
            this.temperatureField = newTemp;
        }
        
        return {
            temperatureField: this.temperatureField,
            maxTemp: Math.max(...this.temperatureField),
            minTemp: Math.min(...this.temperatureField),
            avgTemp: this.temperatureField.reduce((a, b) => a + b, 0) / this.temperatureField.length
        };
    }
}

// ============================================================================
// BTE SOLVER - Drift-Diffusion Carrier Transport
// ============================================================================

class BTESolver {
    constructor() {
        this.KB = 1.380649e-23;        // Boltzmann constant (J/K)
        this.Q_E = 1.602176634e-19;    // Elementary charge (C)
        this.CARRIER_INIT = 1e21;      // Initial carrier density (1/m³)
        
        this.NX = 20;
        this.NY = 20;
        
        // Iterations per fidelity: [Low, Medium, High]
        this.ITERATIONS_PER_FIDELITY = [5, 20, 50];
        
        this.carrierDensity = null;
        this.initializeCarriers();
    }
    
    initializeCarriers() {
        const size = this.NX * this.NY;
        this.carrierDensity = new Float64Array(size);
        this.carrierDensity.fill(this.CARRIER_INIT);
    }
    
    solve(temperatureField, params, fidelityLevel) {
        const iterations = this.ITERATIONS_PER_FIDELITY[fidelityLevel];
        const { cellEfficiency = 0.2 } = params;
        
        // Calculate mobility and diffusion coefficient based on temperature
        let totalCurrent = 0;
        let avgTemp = 0;
        
        for (let i = 0; i < temperatureField.length; i++) {
            const T = temperatureField[i];
            avgTemp += T;
            
            // Temperature-dependent mobility: mu = mu0 * (300/T)^2.4
            const mu = 0.14 * Math.pow(300 / T, 2.4);
            
            // Einstein relation: D = mu * kB * T / q
            const D = mu * this.KB * T / this.Q_E;
            
            // Simple current density calculation
            const E = 1000; // Electric field (V/m) - simplified
            const J = this.Q_E * this.carrierDensity[i] * mu * E;
            totalCurrent += J;
        }
        
        avgTemp /= temperatureField.length;
        const avgCurrentDensity = totalCurrent / temperatureField.length;
        
        return {
            carrierDensity: this.carrierDensity,
            currentDensity: avgCurrentDensity,
            avgTemp: avgTemp
        };
    }
}

// ============================================================================
// NS SOLVER - Simplified Navier-Stokes with Buoyancy
// ============================================================================

class NSSolver {
    constructor() {
        this.NU = 1.57e-5;        // Kinematic viscosity (m²/s)
        this.BETA_TH = 3.4e-3;    // Thermal expansion coefficient (1/K)
        this.G = 9.81;            // Gravitational acceleration (m/s²)
        
        this.NX = 20;
        this.NY = 20;
        this.DX = 0.1;
        
        // Iterations per fidelity: [Low, Medium, High]
        this.ITERATIONS_PER_FIDELITY = [10, 40, 100];
        
        this.velocityX = null;
        this.velocityY = null;
        this.initializeVelocity();
    }
    
    initializeVelocity() {
        const size = this.NX * this.NY;
        this.velocityX = new Float64Array(size);
        this.velocityY = new Float64Array(size);
    }
    
    solve(temperatureField, params, fidelityLevel) {
        const iterations = this.ITERATIONS_PER_FIDELITY[fidelityLevel];
        const { ambientTemp = 298.15 } = params;
        
        // Simplified buoyancy-driven flow
        for (let iter = 0; iter < iterations; iter++) {
            const newVelY = new Float64Array(this.velocityY.length);
            
            for (let j = 0; j < this.NY; j++) {
                for (let i = 0; i < this.NX; i++) {
                    const idx = j * this.NX + i;
                    const T = temperatureField[idx];
                    
                    // Buoyancy force: g * beta * (T - T_ambient)
                    const buoyancy = this.G * this.BETA_TH * (T - ambientTemp);
                    
                    // Simple upwind advection and diffusion
                    let diffusion = 0;
                    if (j > 0 && j < this.NY - 1) {
                        diffusion = this.NU * (this.velocityY[idx + this.NX] + this.velocityY[idx - this.NX] - 2 * this.velocityY[idx]) / (this.DX * this.DX);
                    }
                    
                    newVelY[idx] = this.velocityY[idx] + (buoyancy + diffusion) * 0.01;
                }
            }
            
            this.velocityY = newVelY;
        }
        
        // Calculate max velocity magnitude
        let maxVel = 0;
        for (let i = 0; i < this.velocityX.length; i++) {
            const velMag = Math.sqrt(this.velocityX[i] * this.velocityX[i] + this.velocityY[i] * this.velocityY[i]);
            if (velMag > maxVel) maxVel = velMag;
        }
        
        return {
            velocityX: this.velocityX,
            velocityY: this.velocityY,
            maxVelocity: maxVel
        };
    }
}

// ============================================================================
// SIMULATION RENDERER - Canvas Visualization
// ============================================================================

class SimulationRenderer {
    constructor() {
        this.colormaps = {
            'hot': this.createHotColormap(),
            'viridis': this.createViridisColormap(),
            'coolwarm': this.createCoolwarmColormap()
        };
    }
    
    createHotColormap() {
        // Hot colormap: black -> red -> yellow -> white
        const colors = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            if (t < 0.33) {
                colors.push([Math.floor(t * 3 * 255), 0, 0]);
            } else if (t < 0.66) {
                colors.push([255, Math.floor((t - 0.33) * 3 * 255), 0]);
            } else {
                colors.push([255, 255, Math.floor((t - 0.66) * 3 * 255)]);
            }
        }
        return colors;
    }
    
    createViridisColormap() {
        // Simplified viridis colormap
        const colors = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            const r = Math.floor(68 + t * (253 - 68));
            const g = Math.floor(1 + t * (231 - 1));
            const b = Math.floor(84 + t * (37 - 84));
            colors.push([r, g, b]);
        }
        return colors;
    }
    
    createCoolwarmColormap() {
        // Cool-warm diverging colormap
        const colors = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            if (t < 0.5) {
                const s = t * 2;
                colors.push([Math.floor(s * 255), Math.floor(s * 255), 255]);
            } else {
                const s = (t - 0.5) * 2;
                colors.push([255, Math.floor((1 - s) * 255), Math.floor((1 - s) * 255)]);
            }
        }
        return colors;
    }
    
    renderHeatmap(canvas, field, nx, ny, colormap = 'hot') {
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        
        // Find min and max for normalization
        const minVal = Math.min(...field);
        const maxVal = Math.max(...field);
        const range = maxVal - minVal || 1;
        
        const colors = this.colormaps[colormap] || this.colormaps['hot'];
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Map canvas coordinates to field coordinates
                const fieldX = Math.floor((x / width) * nx);
                const fieldY = Math.floor((y / height) * ny);
                const fieldIdx = fieldY * nx + fieldX;
                
                // Normalize field value to [0, 1]
                const normalized = (field[fieldIdx] - minVal) / range;
                
                // Map to colormap
                const colorIdx = Math.floor(normalized * 255);
                const color = colors[colorIdx];
                
                const pixelIdx = (y * width + x) * 4;
                data[pixelIdx] = color[0];     // R
                data[pixelIdx + 1] = color[1]; // G
                data[pixelIdx + 2] = color[2]; // B
                data[pixelIdx + 3] = 255;      // A
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    renderVectorField(canvas, velocityX, velocityY, nx, ny) {
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw velocity vectors as arrows
        ctx.strokeStyle = 'rgba(0, 100, 200, 0.7)';
        ctx.lineWidth = 1;
        
        const skipX = Math.max(1, Math.floor(nx / 20));
        const skipY = Math.max(1, Math.floor(ny / 20));
        
        for (let j = 0; j < ny; j += skipY) {
            for (let i = 0; i < nx; i += skipX) {
                const idx = j * nx + i;
                const vx = velocityX[idx];
                const vy = velocityY[idx];
                
                const x = (i / nx) * width;
                const y = (j / ny) * height;
                
                const scale = 1000;
                const dx = vx * scale;
                const dy = -vy * scale; // Flip Y for canvas coordinates
                
                // Draw arrow
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + dx, y + dy);
                ctx.stroke();
                
                // Draw arrowhead
                const angle = Math.atan2(dy, dx);
                const headLen = 5;
                ctx.beginPath();
                ctx.moveTo(x + dx, y + dy);
                ctx.lineTo(
                    x + dx - headLen * Math.cos(angle - Math.PI / 6),
                    y + dy - headLen * Math.sin(angle - Math.PI / 6)
                );
                ctx.moveTo(x + dx, y + dy);
                ctx.lineTo(
                    x + dx - headLen * Math.cos(angle + Math.PI / 6),
                    y + dy - headLen * Math.sin(angle + Math.PI / 6)
                );
                ctx.stroke();
            }
        }
    }
}

// ============================================================================
// AURA SIMULATOR - Main Orchestrator
// ============================================================================

class AURASimulator {
    constructor() {
        this.physicsSolver = new AURAPhysicsSolver();
        this.bteSolver = new BTESolver();
        this.nsSolver = new NSSolver();
        this.renderer = new SimulationRenderer();
        
        this.fidelityNames = ['Low Fidelity', 'Medium Fidelity', 'High Fidelity'];
    }
    
    run(params) {
        const startTime = performance.now();
        
        // Get fidelity level
        const fidelityLevel = params.fidelityLevel || 0;
        
        // Run physics solver
        const physicsResults = this.physicsSolver.solve(params, fidelityLevel);
        
        // Run BTE solver
        const bteResults = this.bteSolver.solve(physicsResults.temperatureField, params, fidelityLevel);
        
        // Run NS solver
        const nsResults = this.nsSolver.solve(physicsResults.temperatureField, params, fidelityLevel);
        
        const runtime = performance.now() - startTime;
        
        // Calculate power and efficiency
        const cellArea = this.physicsSolver.NX * this.physicsSolver.NY * this.physicsSolver.DX * this.physicsSolver.DX;
        const solarPower = params.solarIrradiance * cellArea;
        const electricalPower = solarPower * params.cellEfficiency;
        const efficiency = params.cellEfficiency * 100;
        
        return {
            temperatureField: physicsResults.temperatureField,
            bteResults: bteResults,
            nsResults: nsResults,
            statistics: {
                maxTemp: physicsResults.maxTemp,
                minTemp: physicsResults.minTemp,
                avgTemp: physicsResults.avgTemp,
                powerTotal: electricalPower,
                efficiency: efficiency,
                currentDensity: bteResults.currentDensity,
                velocityMax: nsResults.maxVelocity,
                runtime: runtime
            },
            fidelityLevel: fidelityLevel,
            fidelityName: this.fidelityNames[fidelityLevel]
        };
    }
    
    renderResults(results) {
        // Update canvases
        const tempCanvas = document.getElementById('temperature-canvas');
        const powerCanvas = document.getElementById('power-canvas');
        const velCanvas = document.getElementById('velocity-canvas');
        
        if (tempCanvas) {
            this.renderer.renderHeatmap(
                tempCanvas,
                results.temperatureField,
                this.physicsSolver.NX,
                this.physicsSolver.NY,
                'hot'
            );
        }
        
        if (powerCanvas) {
            this.renderer.renderHeatmap(
                powerCanvas,
                results.bteResults.carrierDensity,
                this.bteSolver.NX,
                this.bteSolver.NY,
                'viridis'
            );
        }
        
        if (velCanvas) {
            this.renderer.renderVectorField(
                velCanvas,
                results.nsResults.velocityX,
                results.nsResults.velocityY,
                this.nsSolver.NX,
                this.nsSolver.NY
            );
        }
        
        // Update statistics
        this.updateStatElement('max-temp-value', results.statistics.maxTemp.toFixed(2) + ' K');
        this.updateStatElement('min-temp-value', results.statistics.minTemp.toFixed(2) + ' K');
        this.updateStatElement('avg-temp-value', results.statistics.avgTemp.toFixed(2) + ' K');
        this.updateStatElement('power-total-value', results.statistics.powerTotal.toFixed(2) + ' W');
        this.updateStatElement('efficiency-value', results.statistics.efficiency.toFixed(2) + ' %');
        this.updateStatElement('current-density-value', results.statistics.currentDensity.toExponential(2) + ' A/m²');
        this.updateStatElement('velocity-max-value', results.statistics.velocityMax.toFixed(4) + ' m/s');
        this.updateStatElement('fidelity-display', results.fidelityName);
        this.updateStatElement('runtime-display', results.statistics.runtime.toFixed(2) + ' ms');
    }
    
    updateStatElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }
}

// ============================================================================
// GLOBAL INSTANCE AND DOM WIRING
// ============================================================================

window.AURASimulator = new AURASimulator();

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    const runBtn = document.getElementById('run-simulation-btn');
    
    if (runBtn) {
        runBtn.addEventListener('click', function() {
            // Update status
            const statusElement = document.getElementById('simulation-status');
            if (statusElement) {
                statusElement.textContent = '⏳ Running simulation...';
                statusElement.style.color = '#FF9800';
            }
            
            // Disable button during simulation
            runBtn.disabled = true;
            
            try {
                // Collect parameters from DOM
                const params = {
                    solarIrradiance: parseFloat(document.getElementById('solar-irradiance')?.value || 1000),
                    ambientTemp: parseFloat(document.getElementById('ambient-temperature')?.value || 298.15),
                    windSpeed: parseFloat(document.getElementById('wind-speed')?.value || 2.0),
                    cellEfficiency: parseFloat(document.getElementById('cell-efficiency')?.value || 0.2),
                    thermalConductivity: parseFloat(document.getElementById('thermal-conductivity')?.value || 200),
                    absorptivity: parseFloat(document.getElementById('absorptivity')?.value || 0.9),
                    emissivity: parseFloat(document.getElementById('emissivity')?.value || 0.9)
                };
                
                // Get fidelity level
                const activeFidelityBtn = document.querySelector('.fidelity-btn.active');
                if (activeFidelityBtn) {
                    params.fidelityLevel = parseInt(activeFidelityBtn.dataset.level || '0');
                } else {
                    params.fidelityLevel = 0; // Default to low fidelity
                }
                
                // Run simulation
                const results = window.AURASimulator.run(params);
                
                // Render results
                window.AURASimulator.renderResults(results);
                
                // Update status
                if (statusElement) {
                    statusElement.textContent = '✅ Simulation complete';
                    statusElement.style.color = '#4CAF50';
                }
            } catch (error) {
                console.error('Simulation error:', error);
                if (statusElement) {
                    statusElement.textContent = '❌ Simulation failed: ' + error.message;
                    statusElement.style.color = '#F44336';
                }
            } finally {
                // Re-enable button
                runBtn.disabled = false;
            }
        });
        
        console.log('✅ AURA Physics Engine loaded and ready');
    } else {
        console.error('❌ Run button (#run-simulation-btn) NOT FOUND');
    }
});
