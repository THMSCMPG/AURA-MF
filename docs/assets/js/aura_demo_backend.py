#!/usr/bin/env python3
"""
AURA-MF Web Demo Backend
=========================

Flask-based web application for running low-fidelity (25x25) AURA-MF simulations
with interactive parameter controls via HTML sliders.

Features:
- Real-time parameter adjustment via web interface
- Simplified physics solver for public demo
- Result visualization with matplotlib
- Safety constraints for public-facing deployment

Author: AURA-MF Development Team
Date: 2026-01-28
"""

from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from matplotlib.cm import get_cmap
import io
import base64
from dataclasses import dataclass
from typing import Tuple, Dict
import json
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for cross-origin requests


@dataclass
class SimulationParameters:
    """Container for AURA-MF simulation parameters."""
    
    # Grid parameters (fixed for demo)
    nx: int = 25
    ny: int = 25
    
    # Physical parameters (adjustable via sliders)
    solar_irradiance: float = 1000.0      # W/m² (800-1200)
    ambient_temperature: float = 300.0    # K (280-330)
    wind_speed: float = 1.0               # m/s (0-10)
    cell_efficiency: float = 0.20         # fraction (0.10-0.30)
    thermal_conductivity: float = 130.0   # W/(m·K) (100-200)
    absorptivity: float = 0.95            # fraction (0.85-0.98)
    emissivity: float = 0.90              # fraction (0.80-0.95)
    
    # Time parameters
    dt: float = 0.1                       # Time step (s)
    n_steps: int = 100                    # Number of steps
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'nx': self.nx,
            'ny': self.ny,
            'solar_irradiance': self.solar_irradiance,
            'ambient_temperature': self.ambient_temperature,
            'wind_speed': self.wind_speed,
            'cell_efficiency': self.cell_efficiency,
            'thermal_conductivity': self.thermal_conductivity,
            'absorptivity': self.absorptivity,
            'emissivity': self.emissivity,
            'dt': self.dt,
            'n_steps': self.n_steps
        }


class SimplifiedPhysicsSolver:
    """
    Simplified 2D thermal solver for AURA-MF demo.
    
    This is a LOW-FIDELITY model for demonstration purposes only.
    Production code uses full-physics multi-fidelity solvers.
    """
    
    # Physical constants
    STEFAN_BOLTZMANN = 5.67e-8  # W/(m²·K⁴)
    KELVIN_OFFSET = 273.15      # K
    
    def __init__(self, params: SimulationParameters):
        self.params = params
        self.nx = params.nx
        self.ny = params.ny
        
        # Initialize grids
        self.temperature = np.ones((self.ny, self.nx)) * params.ambient_temperature
        self.power_generation = np.zeros((self.ny, self.nx))
        
        # Cell geometry (assumed)
        self.cell_area = 0.01  # m² per cell
        self.dx = 0.1  # m
        self.dy = 0.1  # m
    
    def compute_solar_absorption(self) -> np.ndarray:
        """
        Compute absorbed solar power across the panel.
        
        Simplified model: uniform irradiance with edge effects.
        """
        # Base absorption
        Q_solar = (self.params.solar_irradiance * 
                   self.params.absorptivity * 
                   self.cell_area)
        
        # Create spatial variation (simple edge effect)
        x = np.linspace(0, 1, self.nx)
        y = np.linspace(0, 1, self.ny)
        X, Y = np.meshgrid(x, y)
        
        # Edge factor (reduced absorption at edges due to shading/reflection)
        edge_factor = 1.0 - 0.1 * (np.exp(-10*X) + np.exp(-10*(1-X)) + 
                                    np.exp(-10*Y) + np.exp(-10*(1-Y)))
        
        return Q_solar * edge_factor
    
    def compute_electrical_generation(self, T: np.ndarray) -> np.ndarray:
        """
        Compute electrical power generation with temperature-dependent efficiency.
        
        η(T) = η₀ [1 - β(T - T_ref)]
        where β ≈ 0.004 /K for silicon
        """
        T_ref = 298.15  # K (25°C)
        beta = 0.004    # Temperature coefficient (/K)
        
        # Temperature-dependent efficiency
        eta_T = self.params.cell_efficiency * (1.0 - beta * (T - T_ref))
        eta_T = np.clip(eta_T, 0.05, 0.30)  # Physical bounds
        
        # Incident solar power
        Q_solar = self.compute_solar_absorption()
        
        # Electrical power output
        P_elec = eta_T * Q_solar
        
        return P_elec
    
    def compute_convective_cooling(self, T: np.ndarray) -> np.ndarray:
        """
        Compute convective heat loss to ambient air.
        
        Q_conv = h·A·(T - T_amb)
        where h depends on wind speed
        """
        # Convection coefficient (simplified correlation)
        # h ≈ 10.45 - v + 10√v  (W/(m²·K)) for forced convection
        v = self.params.wind_speed
        h_conv = 10.45 - v + 10.0 * np.sqrt(v)
        h_conv = max(5.0, h_conv)  # Minimum for natural convection
        
        # Heat loss
        Q_conv = h_conv * self.cell_area * (T - self.params.ambient_temperature)
        
        return Q_conv
    
    def compute_radiative_cooling(self, T: np.ndarray) -> np.ndarray:
        """
        Compute radiative heat loss to sky.
        
        Q_rad = ε·σ·A·(T⁴ - T_sky⁴)
        """
        # Sky temperature (simplified: T_sky ≈ T_amb - 10K)
        T_sky = self.params.ambient_temperature - 10.0
        
        # Radiative heat loss
        Q_rad = (self.params.emissivity * self.STEFAN_BOLTZMANN * 
                 self.cell_area * (T**4 - T_sky**4))
        
        return Q_rad
    
    def compute_conduction(self, T: np.ndarray) -> np.ndarray:
        """
        Compute 2D heat conduction using finite differences.
        
        ∂T/∂t = α·∇²T
        where α = k/(ρ·c_p) is thermal diffusivity
        """
        # Thermal properties (silicon PV module)
        k = self.params.thermal_conductivity  # W/(m·K)
        rho = 2330.0  # kg/m³ (silicon density)
        c_p = 700.0   # J/(kg·K) (silicon specific heat)
        alpha = k / (rho * c_p)  # m²/s
        
        # Laplacian using 5-point stencil
        T_pad = np.pad(T, 1, mode='edge')
        
        d2T_dx2 = (T_pad[1:-1, 2:] - 2*T_pad[1:-1, 1:-1] + T_pad[1:-1, :-2]) / self.dx**2
        d2T_dy2 = (T_pad[2:, 1:-1] - 2*T_pad[1:-1, 1:-1] + T_pad[:-2, 1:-1]) / self.dy**2
        
        laplacian = d2T_dx2 + d2T_dy2
        
        # Heat flux from conduction
        Q_cond = alpha * laplacian * rho * c_p * self.cell_area * self.dx
        
        return Q_cond
    
    def run_simulation(self) -> Dict:
        """
        Run the complete simulation and return results.
        """
        logger.info("Starting simulation with parameters: %s", self.params.to_dict())
        start_time = datetime.now()
        
        # Storage for time evolution
        T_history = []
        P_history = []
        
        # Time integration
        for step in range(self.params.n_steps):
            # Absorbed solar power
            Q_solar = self.compute_solar_absorption()
            
            # Electrical generation (removes energy from thermal system)
            P_elec = self.compute_electrical_generation(self.temperature)
            self.power_generation = P_elec
            
            # Heat losses
            Q_conv = self.compute_convective_cooling(self.temperature)
            Q_rad = self.compute_radiative_cooling(self.temperature)
            
            # Heat conduction
            Q_cond = self.compute_conduction(self.temperature)
            
            # Net heat flux
            # Q_net = Q_absorbed - Q_electrical - Q_convection - Q_radiation + Q_conduction
            Q_net = (1.0 - self.params.cell_efficiency) * Q_solar - Q_conv - Q_rad + Q_cond
            
            # Update temperature (explicit Euler)
            # Q = m·c_p·dT/dt  =>  dT = Q·dt / (m·c_p)
            mass = 2330.0 * self.cell_area * 0.002  # kg (ρ·A·thickness)
            c_p = 700.0  # J/(kg·K)
            
            dT = Q_net * self.params.dt / (mass * c_p)
            self.temperature += dT
            
            # Safety clamps
            self.temperature = np.clip(self.temperature, 200.0, 450.0)
            
            # Store every 10th step
            if step % 10 == 0:
                T_history.append(self.temperature.copy())
                P_history.append(self.power_generation.copy())
        
        # Compute summary statistics
        results = {
            'temperature_field': self.temperature.tolist(),
            'power_field': self.power_generation.tolist(),
            'temperature_mean': float(np.mean(self.temperature)),
            'temperature_max': float(np.max(self.temperature)),
            'temperature_min': float(np.min(self.temperature)),
            'power_total': float(np.sum(self.power_generation)),
            'power_mean': float(np.mean(self.power_generation)),
            'efficiency_avg': float(np.mean(self.power_generation / 
                                           (self.compute_solar_absorption() + 1e-10))),
            'runtime_ms': (datetime.now() - start_time).total_seconds() * 1000
        }
        
        logger.info("Simulation complete in %.2f ms", results['runtime_ms'])
        
        return results


def create_visualization(temperature: np.ndarray, power: np.ndarray) -> str:
    """
    Create visualization of temperature and power fields.
    
    Returns:
        Base64-encoded PNG image
    """
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    
    # Temperature field
    ax1 = axes[0]
    im1 = ax1.imshow(temperature - 273.15, cmap='hot', origin='lower', 
                     interpolation='bilinear')
    ax1.set_title('Temperature Distribution (°C)', fontsize=14, fontweight='bold')
    ax1.set_xlabel('X Position')
    ax1.set_ylabel('Y Position')
    cbar1 = plt.colorbar(im1, ax=ax1)
    cbar1.set_label('Temperature (°C)', rotation=270, labelpad=20)
    
    # Power generation field
    ax2 = axes[1]
    im2 = ax2.imshow(power, cmap='viridis', origin='lower', 
                     interpolation='bilinear')
    ax2.set_title('Power Generation (W)', fontsize=14, fontweight='bold')
    ax2.set_xlabel('X Position')
    ax2.set_ylabel('Y Position')
    cbar2 = plt.colorbar(im2, ax=ax2)
    cbar2.set_label('Power (W)', rotation=270, labelpad=20)
    
    plt.tight_layout()
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.read()).decode('utf-8')
    plt.close()
    
    return image_base64


# Flask routes

@app.route('/')
def index():
    """Serve the main demo interface."""
    return render_template('demo.html')


@app.route('/api/simulate', methods=['POST'])
def run_simulation():
    """
    Run AURA-MF simulation with user-provided parameters.
    """
    try:
        # Parse parameters from request
        data = request.json
        
        # Create parameter object with validation
        params = SimulationParameters(
            solar_irradiance=float(data.get('solar_irradiance', 1000.0)),
            ambient_temperature=float(data.get('ambient_temperature', 300.0)),
            wind_speed=float(data.get('wind_speed', 1.0)),
            cell_efficiency=float(data.get('cell_efficiency', 0.20)),
            thermal_conductivity=float(data.get('thermal_conductivity', 130.0)),
            absorptivity=float(data.get('absorptivity', 0.95)),
            emissivity=float(data.get('emissivity', 0.90))
        )
        
        # Validate ranges (safety constraints)
        if not (800 <= params.solar_irradiance <= 1200):
            return jsonify({'error': 'Solar irradiance out of range [800-1200]'}), 400
        if not (280 <= params.ambient_temperature <= 330):
            return jsonify({'error': 'Ambient temperature out of range [280-330]'}), 400
        if not (0 <= params.wind_speed <= 10):
            return jsonify({'error': 'Wind speed out of range [0-10]'}), 400
        if not (0.10 <= params.cell_efficiency <= 0.30):
            return jsonify({'error': 'Cell efficiency out of range [0.10-0.30]'}), 400
        
        # Run simulation
        solver = SimplifiedPhysicsSolver(params)
        results = solver.run_simulation()
        
        # Create visualization
        temperature_array = np.array(results['temperature_field'])
        power_array = np.array(results['power_field'])
        visualization = create_visualization(temperature_array, power_array)
        
        # Return results
        response = {
            'success': True,
            'results': results,
            'visualization': visualization,
            'parameters': params.to_dict()
        }
        
        return jsonify(response)
    
    except Exception as e:
        logger.error("Simulation error: %s", str(e), exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/parameters/default', methods=['GET'])
def get_default_parameters():
    """Return default simulation parameters."""
    params = SimulationParameters()
    return jsonify(params.to_dict())


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})


if __name__ == '__main__':
    # Run in development mode
    # For production, use gunicorn or similar WSGI server
    logger.info("Starting AURA-MF Demo Server...")
    app.run(host='0.0.0.0', port=5000, debug=True)
