# AURA-MF
Atmospheric Unified Radiation Assessment with Multi-Fidelity

A high-fidelity radiation transport and thermal evolution engine supporting hierarchical parallelization and surrogate modeling.

## Scientific Overview:
Monte Carlo Radiation Transport: Simulates particle energy deposition (MeV) using stochastic sampling.

Thermal Evolution: Solves the heat equation in Silicon ($K_Si = 148W/m⋅K$) to track temperature changes over time.

Coupling: The Monte Carlo energy deposition is converted into a volumetric source term ($W/m^3$) for the thermal solver.

## Fidelity Roadmap

| Version | Complexity | Key Features |
| --- | --- | --- |
| SimV1 | High-Fidelity Baseline | coupled model (MC + Thermal). |
| SimV2 | Multi-Fidelity (MF) | Introduction of low/high-fidelity approximations for speed. |
| SimV3 | MF2 + Optimization | Use of low/med-fidelity and Optimization Logic |
| SimV4 | ML Optimized + OpenMP | Use of machine learning optimization and multi-core parallelization. |


### Technical Architecture
Solvers: Organized by fidelity level, allowing for hierarchical benchmarking.

Visualization: Integrated pyplot module for generating 2D heatmaps and 3D space-time surface plots.

## Verification and Accuracy
Energy Conservation: Checks the balance between total deposited energy and the thermal source term.

Mathematical Consistency: Includes a Poisson residual check for numerical stability.

Physical Bounds: Automatic monitoring of Max/Min temperatures to detect solver instability.

## Installation and Dependencies
Compilers: GFortran and Fortran Program Manager.
