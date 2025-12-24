module Accuracy_Module
    use Data_Module
    implicit none

contains

subroutine Check_Simulation_Accuracy()
        real(DP) :: Total_PTS_Energy, Total_Thermal_Source
        real(DP) :: Energy_Error_Percent
        real(DP), parameter :: EPS = 1.0E-12_DP

        write(*,*) "--- Accuracy & Verification Report ---"

        ! energy conservation check
        Total_PTS_Energy = sum(Deposited_Energy) * 1.602E-19_DP * 1.0E6_DP * Scaling_Factor
        
        ! Total_Thermal_Source (W/m^3 * s * m^3) = Joules
        Total_Thermal_Source = sum(MC_Source_Term) * MCS_DT * (DX * DY * 0.0002_DP)
        
        if (abs(Total_PTS_Energy) > EPS) then
            Energy_Error_Percent = abs(Total_PTS_Energy - Total_Thermal_Source) / Total_PTS_Energy * 100.0_DP
            write(*, "(A, F12.6, A)") "  Coupling Energy Balance Error: ", Energy_Error_Percent, "%"
        else
            write(*,*) "  Coupling Energy Balance Error: 0.0000% (No energy deposited)"
        end if

        ! Physical bounds check
        write(*, "(A, F10.4, A)") "  Max Temp: ", maxval(T_Temp), " K"
        write(*, "(A, F10.4, A)") "  Min Temp: ", minval(T_Temp), " K"
        
        ! Mathematical verification
        call Verify_Poisson_Against_Residual()
        write(*,*) "---------------------------------------"
    end subroutine Check_Simulation_Accuracy

    subroutine Verify_Poisson_Against_Residual()
        integer :: I, J
        real(DP) :: Lap_P, Local_Err, Max_Err

        Max_Err = 0.0_DP
        do J = 2, NY-1
            do I = 2, NX-1
                ! Numerical Laplacian check against Source
                Lap_P = (P_PRESS(I+1, J) + P_PRESS(I-1, J) + &
                         P_PRESS(I, J+1) + P_PRESS(I, J-1) - 4.0_DP*P_PRESS(I, J)) / (DX*DY)
                Local_Err = abs(Lap_P - Source_Term(I, J))
                if (Local_Err > Max_Err) Max_Err = Local_Err
            end do
        end do
        ! Using double quotes to prevent coarray compiler errors
        write(*, "(A, E12.4)") "  Poisson Residual Consistency Error: ", Max_Err
    end subroutine Verify_Poisson_Against_Residual

end module Accuracy_Module
