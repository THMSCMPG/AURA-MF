# AURA-MF
Atmospheric Unified Radiation Assessment with Multi-Fidelity

AURA-MF is an independent research framework designed to simulate complex atmospheric interactions by coupling radiation transport with fluid dynamics. It utilizes a multi-fidelity hierarchical approach to solve the Boltzmann Transport Equation (BTE) and Navier-Stokes (N-S) equations efficiently.

## Scientific Overview:
High-resolution coupling of BTE and N-S is computationally expensive for large-scale research. AURA-MF addresses this by:
- Radiation Transport: Modeling photon travel through various atmospheric densities.
- Fluid Dynamics: Solving air flow and thermal gradients.
- Computational Efficiency: Using low-fidelity models to focus high-fidelity computational resources where they are needed most.

## Fidelity Roadmap

| Version | Complexity | Key Features |
| --- | --- | --- |
| SimV1 | High-Fidelity Baseline | coupled model (MC + Thermal). |
| SimV2 | Multi-Fidelity (MF) | Introduction of low/high-fidelity approximations for speed. |
| SimV3 | MF + Optimization | Use of low/med-fidelity and Optimization Logic |
| SimV4 | MF + Optimization + OpenMP | Use of low/med/high-fidelity, machine learning optimization, and multi-core parallelization. |


### Technical Architecture
The framework leverages a technical stack to balance speed and physical accuracy:
- Core: Written in Fortran 90 for high-performance numerical throughput.
- Solvers: Organized by fidelity level, allowing for hierarchical benchmarking.
  - Monte Carlo: Stochastic particle energy deposition.
  - Diffusion/Poisson: Approximations for pressure and thermal fields.
- Visualization: Integrated pyplot module for generating 2D heatmaps and 3D space-time surface plots.

## Verification and Accuracy
AURA-MF includes a dedicated Accuracy_Module to ensure physical consistency across fidelity levels:
- Energy Conservation: Checks the balance between total deposited energy and the thermal source term.
- Mathematical Consistency: Includes a Poisson residual check for numerical stability.
- Physical Bounds: Automatic monitoring of Max/Min temperatures to detect solver instability.

## Directory Structure
```text
AURA-MF/
├── README.md
├── solvers/
│   ├── v1_high_fidelity/      # Baseline Coupled BTE/N-S
│   ├── v2_low_high_fidelity/       # MF
└── scripts/
```
## Current Status (Dec 2025)
- Proof of Concept: Finalized
- v1_high_fidelity: In verification phase, comparing with open data from Sandia National Labs
- v2_low_high_fidelity: In build phase
- v3 - v4: In research and planning phase

## Installation and Dependencies
Compilers: GFortran and Fortran Program Manager.
