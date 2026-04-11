export const loginRateLimit = {
  limit: async () => {
    return {
      success: true,
      reset: Date.now(),
    };
  },
};