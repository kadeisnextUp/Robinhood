// Mock API service - will be replaced with real backend calls
// Helper function to get next Saturday at 11:59 PM
const getNextSaturdayEnd = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7; // Days until next Saturday
  
  const nextSaturday = new Date(now);
  nextSaturday.setDate(now.getDate() + daysUntilSaturday);
  nextSaturday.setHours(23, 59, 59, 999); // Set to 11:59:59 PM
  
  return nextSaturday;
};

// Helper function to get last Sunday (start of voting week)
const getLastSunday = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceSunday = dayOfWeek === 0 ? 0 : dayOfWeek;
  
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - daysSinceSunday);
  lastSunday.setHours(0, 0, 0, 0); // Set to midnight
  
  return lastSunday;
};

// Mock API service - will be replaced with real backend calls
export const resultsAPI = {
  // Fetch current week's results
  getCurrentResults: async () => {
    // TODO: Replace with actual API call
    // import apiClient from './client';
    // return apiClient.get('/results/current');
    
    // Mock data for now
    return new Promise((resolve) => {
      setTimeout(() => {
        const votingPeriod = {
          startDate: getLastSunday().toISOString(),
          endDate: getNextSaturdayEnd().toISOString(),
        };
        
        resolve({
          votingPeriod,
          charities: [
            { id: 1, name: "Clean Water Fund", votes: 34},
            { id: 2, name: "Food Bank Alliance", votes: 43},
            { id: 3, name: "Education for All", votes: 22},
            { id: 4, name: "Animal Rescue Network", votes: 566},
            { id: 5, name: "Medical Aid International", votes: 300},
            { id: 6, name: "Global Reforestation", votes: 22},
            { id: 7, name: "Mental Health Support", votes: 1000},
            { id: 8, name: "Disaster Relief Fund", votes: 3},
            { id: 9, name: "Youth Empowerment", votes: 32},
            { id: 10, name: "Elderly Care Initiative", votes: 3},
            { id: 11, name: "Arts & Culture Fund", votes: 17},
          ],
          totalVotes: 1725,
          userHasVoted: false,
        });
      }, 500); // Simulate network delay
    });
  },
};