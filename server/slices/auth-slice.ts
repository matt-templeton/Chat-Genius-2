export const { logout, updateUserStatus, updateUserProfile } = authSlice.actions;

const authReducer = authSlice.reducer;
export default authReducer;

// Add updateUserProfile to reducers
reducers: {
  // ... existing reducers ...
  updateUserProfile: (state, action: PayloadAction<User>) => {
    if (state.user) {
      state.user = {
        ...state.user,
        profilePicture: action.payload.profilePicture
      };
    }
  },
}, 