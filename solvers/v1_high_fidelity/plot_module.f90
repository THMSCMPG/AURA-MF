module plot_module
    use Data_Module, only: DP, NX, NY, MAX_SAVED_STEPS
    use pyplot_module
    implicit none

contains

    subroutine plot_temperature(T_Final)
        real(DP), intent(in) :: T_Final(0:NX+1, 0:NY+1)

        ! local variables for plotting
        type(pyplot) :: Plt
        real(DP), dimension(NX, NY) :: T_Interior
        real(DP), dimension(NX) :: X_Coord
        real(DP), dimension(NY) :: Y_Coord
        integer :: I, J

        ! extract the interior data
        do J = 1, NY
            do I = 1, NX
                T_Interior(I, J) = T_Final(I, J)
            end do
        end do
        
        ! create X and Y coordinates
        do I = 1, NX
            X_Coord(I) = (real(I, DP) - 0.5_DP) / real(NX, DP)
        end do
        do J = 1, NY
            Y_Coord(J) = (real(J, DP) - 0.5_DP) / real(NY, DP)
        end do

        ! setup plot object
        call Plt%initialize(title='Final Temperature Field', &
                xlabel='X Coordinate', &
                ylabel='Y Coordinate')
        
        ! add the 2D data (heatmap)
        call Plt%add_imshow(T_Interior)

        ! render to file and show
        call Plt%savefig('temperature_result.png')
        call Plt%showfig()

    end subroutine plot_temperature

    
    subroutine plot_3d_evolution_x(T_History, Time_Array, Count)
        real(DP), dimension(NX, NY, MAX_SAVED_STEPS), intent(in) :: T_History
        real(DP), dimension(MAX_SAVED_STEPS), intent(in) :: Time_Array
        integer, intent(in) :: Count
    
        type(pyplot) :: Plt_3D
        real(DP), dimension(NX, Count) :: Slice_Data
        real(DP), dimension(NX) :: X_Coords
        integer :: I, K

        ! Extract the center slice (Y = NY/2)
        do K = 1, Count
                do I = 1, NX
                Slice_Data(I, K) = T_History(I, (NY+1)/2, K)
                end do
        end do

        ! Create spatial coordinate array (e.g., indices 1 to NX)
        do I = 1, NX
                X_Coords(I) = real(I, DP)
        end do

        ! Initialize the 3D plot
        call Plt_3D%initialize(title='Thermal Evolution Surface', &
                           xlabel='X-Coordinate (Spatial)', &
                           ylabel='Time (s)', &
                           zlabel='Temperature (T)', &
                           mplot3d=.true.)
    
        ! Use plot_surface(x, y, z) 
        ! Note: X and Y are 1D arrays, Slice_Data is the 2D height array
        call Plt_3D%plot_surface(X_Coords, Time_Array(1:Count), Slice_Data, &
                             label='Thermal Surface', &
                             linestyle='-', &
                             linewidth=0, &
                             cmap='viridis')
    
        call Plt_3D%savefig('space_time_3d_surface.png')
        call Plt_3D%showfig()
     end subroutine plot_3d_evolution_x

     subroutine plot_3d_evolution_y(T_History, Time_Array, Count)
                implicit none

                ! Input arguments
                real(DP), dimension(NX, NY, MAX_SAVED_STEPS), intent(in) :: T_History
                real(DP), dimension(MAX_SAVED_STEPS), intent(in) :: Time_Array
                integer, intent(in) :: Count

                type(pyplot) :: Plt_3D
                real(DP), dimension(NY, Count) :: Slice_Data
                real(DP), dimension(NY) :: Y_Coords
                integer :: J, K

                ! Create Y-coordinate array (Spatial axis)
                do J = 1, NY
                        Y_Coords(J) = real(J, DP)
                end do

                ! Extract slice at center X (X = NX/2)
                do K = 1, Count
                do J = 1, NY
                        Slice_Data(J, K) = T_History((NX+1)/2, J, K)
                end do
                end do

                ! Initialize the 3D plot environment
                call Plt_3D%initialize(title='Thermal Evolution: Y-Coordinate vs Time', &
                           xlabel='Y-Coordinate (Spatial)', &
                           ylabel='Time (s)', &
                           zlabel='Temperature (T)', &
                           mplot3d=.true.)

                ! Render the 3D surface
                call Plt_3D%plot_surface(Y_Coords, Time_Array(1:Count), Slice_Data, &
                             label='Y-Evolution', &
                             linestyle='-', &
                             linewidth=0, &
                             cmap='magma')

                ! Export and cleanup
                call Plt_3D%savefig('evolution_y_3d.png')
                call Plt_3D%showfig()
                call Plt_3D%destroy()
        end subroutine plot_3d_evolution_y

end module plot_module
