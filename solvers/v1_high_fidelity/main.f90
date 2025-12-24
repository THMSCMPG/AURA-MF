program Coupled_Simulation
    use Data_Module
    use plot_module
    use Accuracy_Module

    implicit none
    integer :: I, J, count_start, count_end, count_rate
    real(DP) :: total_runtime, Max_Delta_T, T_Old_Avg
    allocate(T_History_3D(NX, NY, MAX_SAVED_STEPS))

    ! Initialize scaling based on physical target flux (1000 W/m^2)
    Scaling_Factor = Total_Power_Watts / real(Num_Particles * Num_Histories, DP)
    Saved_Step_Count = 0
    TIME = 0.0_DP
    Step_Count = 0

    write(*,*) 'Starting Coupled High Fidelity Simulation'
    write(*,*) 'Target Equilibrium: 320.72 K (47.57 C)'
    
    call Initialize_MCS_Conditions()
    call SYSTEM_CLOCK(count_start, count_rate)

    ! Pre-processing:
    ! Run Monte Carlo once with high statistics to define the steady heat source
    write(*,*) 'Calculating Monte Carlo Energy Deposition...'
    call MC_PTS()

    ! Convert Energy (MeV) to Volumetric Source Term (W/m^3)
    ! Thickness is 0.0002 m (200 microns)
    MC_Source_Term = (Deposited_Energy * 1.602E-19_DP * 1.0E6_DP * Scaling_Factor) / &
                     (MCS_DT * DX * DY * 0.0002_DP)
    
    ! Debug check for source term sanity
    if (maxval(MC_Source_Term) > 1.0E25_DP .or. any(MC_Source_Term /= MC_Source_Term)) then
        write(*,*) 'CRITICAL ERROR: Source Term exploded.'
        stop
    end if

    ! Thermal Evolution Loop
    write(*,*) 'Beginning Thermal Stepping...'
    do while (TIME < T_Final)
        T_Old_Avg = sum(T_Temp(1:NX, 1:NY)) / real(NX*NY, DP)

        ! Stability check
        if (maxval(T_Temp) > 5000.0_DP .or. minval(T_Temp) < 0.0_DP) then
            write(*,*) 'STABILITY VIOLATION at Step:', Step_Count
            stop 'Thermal Solver Instability.'
        end if

        call Step_MCS(MCS_DT)
        call Poisson_SQR()

        TIME = TIME + MCS_DT
        Step_Count = Step_Count + 1

        ! Logging and Accuracy Checks
        if (mod(Step_Count, Output_Freq) == 0) then
            Saved_Step_Count = Saved_Step_Count + 1 
            if (Saved_Step_Count <= MAX_SAVED_STEPS) then
                Time_History(Saved_Step_Count) = TIME
                T_History_3D(:, :, Saved_Step_Count) = T_Temp(1:NX, 1:NY)
                Temp_History_Probe(Saved_Step_Count) = T_Temp((NX+1)/2, (NY+1)/2)
            end if

            Max_Delta_T = abs((sum(T_Temp(1:NX, 1:NY)) / real(NX*NY, DP)) - T_Old_Avg)
            write(*, "(A, F12.4, A)") "  Current Simulation Time: ", TIME, " s"
            
            call Check_Simulation_Accuracy()
            call Write_Output(Step_Count)
            
            ! Convergence break (Steady State reached)
            if (Max_Delta_T < 1.0E-10_DP .and. TIME > 50.0_DP) then
                write(*,*) 'Steady State Convergence Achieved.'
                exit
            end if
        end if
    end do

    write(*,*) 'Simulation Finished. Plotting Results...'
    call SYSTEM_CLOCK(count_end)
    total_runtime = real(count_end - count_start, DP) / real(count_rate, DP)
    write(*, '(A, F10.4, A)') ' >>> Total Simulation Runtime: ', total_runtime, ' seconds'

    ! Call all plot routines
    call plot_temperature(T_Temp)
    call plot_3d_evolution_x(T_History_3D, Time_History, Saved_Step_Count)
    call plot_3d_evolution_y(T_History_3D, Time_History, Saved_Step_Count)

contains

    subroutine Initialize_MCS_Conditions()
        T_Temp = 292.15_DP
        U_Fixed = 0.5_DP
        V_Fixed = 0.0_DP
        call Apply_MCS_BCs()
    end subroutine Initialize_MCS_Conditions

    subroutine Apply_MCS_BCs()
        integer :: I, J
    real(DP), parameter :: h_conv = 10.0_DP  ! Heat transfer coefficient (W/m^2*K)
    real(DP), parameter :: T_ambient = 293.15_DP

    ! bottom bounds
    ! This balances the Monte Carlo heat against environmental cooling
    do I = 0, NX + 1
        T_Temp(I, 0) = T_Temp(I, 1) - (h_conv * DX / K_Si) * (T_Temp(I, 1) - T_ambient)
    end do

    ! Adiabatic (Insulated)
    T_Temp(:, NY+1) = T_Temp(:, NY) 

    ! Sides: Symmetry / Insulated
    do J = 0, NY+1
        T_Temp(0, J) = T_Temp(1, J)
        T_Temp(NX+1, J) = T_Temp(NX, J)
    end do
    end subroutine Apply_MCS_BCs

    subroutine Step_MCS(DT)
        real(DP), intent(in) :: DT
        integer :: I, J
        do I = 1, NX
            do J = 1, NY
                T_Temp_New(I, J) = T_Temp(I, J) + &
                      ALPHA * DT * ((T_Temp(I+1,J) - 2.0*T_Temp(I,J) + T_Temp(I-1,J))/DX**2 + &
                      (T_Temp(I,J+1) - 2.0*T_Temp(I,J) + T_Temp(I,J-1))/DY**2) + &
                      (MC_Source_Term(I,J) / (Rho_Si * Cp_Si)) * DT
            end do
        end do
        T_Temp = T_Temp_New
        call Apply_MCS_BCs()
    end subroutine Step_MCS

    subroutine MC_PTS()
        real :: RND, RND_TYPE, DIRX, DIRY, XP, YP, E_PART, DIST
        real :: MT, MP, MC
        integer :: H, P, IX, IY, ITER_P
        logical :: ALIVE
        real(DP), parameter :: PI_L = 3.141592653589793_DP
        real, parameter :: HE_PROB = 0.0001 

        Deposited_Energy = 0.0_DP
        do H = 1, Num_Histories
            do P = 1, Num_Particles
                call random_number(RND_TYPE)
                if (RND_TYPE < HE_PROB) then
                    E_PART = Initial_Energy 
                    call Get_Mu(E_PART, MT, MP, MC)
                    E_PART = E_PART * 1.0E6_DP 
                else
                    call random_number(RND)
                    if (RND < 0.07) then
                        E_PART = 4.0_DP 
                    else if (RND < 0.52) then
                        E_PART = 2.5_DP 
                    else
                        E_PART = 1.1_DP 
                    end if
                    call Get_Spectral_Mu(E_PART, MT, MP, MC)
                end if

                call random_number(RND)
                XP = RND * LX 
                YP = LY - 0.001_DP 
                DIRX = 0.0_DP
                DIRY = -1.0_DP 
                ALIVE = .true.
                ITER_P = 0 

                do while (ALIVE)
                    ITER_P = ITER_P + 1
                    call random_number(RND)
                    DIST = -(1.0_DP / MT) * log(max(RND, 1.0e-12))
                    XP = XP + DIST * DIRX
                    YP = YP + DIST * DIRY
                    IX = int(XP / DX) + 1
                    IY = int(YP / DY) + 1

                    if (IX < 1 .or. IX > NX .or. IY < 1 .or. IY > NY .or. ITER_P > Max_Iter_Per_Particle) then
                        ALIVE = .false.
                        cycle
                    end if

                    call random_number(RND)
                    if (RND < MP) then
                        Deposited_Energy(IX, IY) = Deposited_Energy(IX, IY) + E_PART
                        ALIVE = .false.
                    else
                        call random_number(RND)
                        DIRX = cos(2.0_DP * PI_L * RND)
                        DIRY = sin(2.0_DP * PI_L * RND)
                        E_PART = E_PART * 0.99_DP
                        if (E_PART < Energy_Threshold) ALIVE = .false.
                    end if
                end do
            end do
        end do
    end subroutine MC_PTS

    subroutine Get_Mu(E, MT, MP, MC)
       real, intent(in) :: E
       real, intent(out) :: MT, MP, MC
       if (E > 1.0) then
           MT = 10.0; MP = 0.01; MC = 0.99 
       else
           MT = 50.0; MP = 0.5; MC = 0.5 
       end if
    end subroutine Get_Mu  

    subroutine Get_Spectral_Mu(E, MT, MP, MC)
        real, intent(in) :: E
        real, intent(out) :: MT, MP, MC
        if (E > 3.1) then
            MT = 500.0; MP = 0.95; MC = 0.05 
        else if (E >= 1.8) then
            MT = 100.0; MP = 0.20; MC = 0.80
        else
            MT = 25.0; MP = 0.10; MC = 0.90
        end if
    end subroutine Get_Spectral_Mu

    subroutine Poisson_SQR()
        integer :: K_SOR, I, J
        real(DP) :: RESID_SQ, RESID_MAX, P_OLD, P_GS
        Source_Term = MC_Source_Term 
        K_SOR = 0; RESID_MAX = Poisson_Tol + 1.0_DP
        do while (RESID_MAX > Poisson_Tol .and. K_SOR < 2000)
            K_SOR = K_SOR + 1; RESID_SQ = 0.0_DP
            do J = 1, NY
                do I = 1, NX
                    P_OLD = P_PRESS(I, J)
                    P_GS = 0.25_DP * (P_PRESS(I+1, J) + P_PRESS(I-1, J) + &
                                      P_PRESS(I, J+1) + P_PRESS(I, J-1) - DX*DY*Source_Term(I, J))
                    P_PRESS(I, J) = (1.0_DP - OMEGA) * P_OLD + OMEGA * P_GS
                    RESID_SQ = RESID_SQ + (P_PRESS(I, J) - P_OLD)**2
                end do
            end do
            RESID_MAX = sqrt(RESID_SQ / real(NX*NY, DP))
        end do
    end subroutine Poisson_SQR
   
    subroutine Write_Output(Step)
        integer, intent(in) :: Step
        integer :: I, J
        integer, save :: file_unit = 15
        logical, save :: first_call = .true.
        if (first_call) then
            open(unit=file_unit, file='simulation_results.txt', status='replace', action='write')
            write(file_unit, '(A)') '# Simulation Master Output'
            write(file_unit, '(A, F10.4, A, F10.4)') '# L_X: ', LX, ' L_Y: ', LY
            write(file_unit, '(A, I4, A, I4)') '# Grid: ', NX, 'x', NY
            first_call = .false.
        else
            open(unit=file_unit, file='simulation_results.txt', status='old', position='append', action='write')
        end if
        write(file_unit, "(A, I6, A, F10.4, A, F10.4, A, E12.4)") &
                "Step: ", Step_Count, " Time:", TIME, " MaxT:", maxval(T_Temp), " dT:", Max_Delta_T
        write(file_unit, '(A)') 'X_m          Y_m          Temp_K       Source_W_m3'
        do I = 1, NX
            do J = 1, NY
                write(file_unit, '(4E14.6)') real(I, DP)*DX, real(J, DP)*DY, T_Temp(I, J), MC_Source_Term(I, J)
            end do
        end do
        close(file_unit)
    end subroutine Write_Output

end program Coupled_Simulation
