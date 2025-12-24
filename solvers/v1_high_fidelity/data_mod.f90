module Data_Module
    implicit none

    integer, parameter :: DP = kind(1.0D0)
    integer, parameter :: NX = 100, NY = 100
    real(DP), parameter :: LX = 1.0_DP, LY = 1.0_DP
    real(DP), parameter :: DX = LX / real(NX, DP), DY = LY / real(NY, DP)
    real(DP), parameter :: Cell_Area = DX * DY

    ! Silicon Properties
    real(DP), parameter :: K_Si = 148.0_DP ! Thermal Conductivity
    real(DP), parameter :: Rho_Si = 2329.0_DP ! Density
    real(DP), parameter :: Cp_Si = 700.0_DP ! Specific Heat
    real(DP), parameter :: ALPHA = K_Si / (Rho_Si * Cp_Si)
    
    ! Climate Properties
    real(DP), dimension(0:NX+1, 0:NY+1) :: T_Temp, T_Temp_New
    real(DP), dimension(0:NX+1, 0:NY+1) :: U_Fixed, V_Fixed
    real(DP), dimension(1:NX, 1:NY) :: MC_Source_Term
    real(DP), dimension(1:NX, 1:NY) :: Deposited_Energy

    ! Time settings - increased T_Final to reach 320 K
    real(DP) :: TIME = 0.0_DP
    real(DP) :: T_Final = 604800.0_DP 
    real(DP), parameter :: DT_Limit = (DX**2 * DY**2) / (2.0_DP * Alpha * (DX**2 + DY**2))
    real(DP) :: MCS_DT = DT_Limit * 0.75_DP
    integer :: Step_Count = 0
    integer :: Output_Freq = 500

    ! Monte Carlo Parameters
    integer, parameter :: Num_Particles = 100000
    integer, parameter :: Num_Histories = 10000
    real(DP), parameter :: Initial_Energy = 4.5_DP
    real(DP), parameter :: Energy_Threshold = 0.01_DP
    integer, parameter :: Max_Iter_Per_Particle = 100000

    ! Poisson Solver Settings
    real(DP), parameter :: OMEGA = 1.2_DP
    real(DP), parameter :: Poisson_Tol = 1.0E-6_DP
    real(DP), dimension(0:NX+1, 0:NY+1) :: P_PRESS
    real(DP), dimension(1:NX, 1:NY) :: Source_Term
    
    ! Power Scaling
    real(DP), parameter :: Target_Flux = 1000.0_DP
    real(DP), parameter :: Total_Power_Watts = Target_Flux * (LX * LY)
    real(DP) :: Scaling_Factor 

    ! Plotting buffers
    integer, parameter :: MAX_SAVED_STEPS = 25000 
    real(DP), dimension(MAX_SAVED_STEPS) :: Time_History = 0.0_DP
    real(DP), dimension(MAX_SAVED_STEPS) :: Temp_History_Probe = 0.0_DP
    real(DP), dimension(:,:,:), allocatable :: T_History_3D
    integer :: Saved_Step_Count = 0

end module Data_Module
