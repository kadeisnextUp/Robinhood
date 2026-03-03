import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRequireAuth } from '../../hooks/useRequiredAuth';

// Fake charity data for now
const charities = [
  { id: 1, name: "Clean Water Fund", description: "Providing clean water to communities in need" , image: "https://picsum.photos/400/200?random=1", category: "Environment"},
  { id: 2, name: "Food Bank Alliance", description: "Fighting hunger across America", image: "https://picsum.photos/400/200?random=2", category: "Food Security"},
  { id: 3, name: "Education for All", description: "Building schools in underserved areas", image: "https://picsum.photos/400/200?random=3", category: "Education"},
  { id: 4, name: "Animal Rescue Network", description: "Saving and rehoming abandoned pets", image: "https://picsum.photos/400/200?random=4", category: "Animal Welfare"},
  { id: 5, name: "Medical Aid International", description: "Providing healthcare to remote regions", image: "https://picsum.photos/400/200?random=5", category: "Healthcare"},
];

export default function HomeScreen() {
  // component states for loading
  const [loading, setLoading] = useState(true);
  const [votingFor, setVotingFor] = useState(null);
  // show loading spinner while fetching charities use when backend is ready
  /*
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text, marginTop: spacing.md }}>
          Loading charities...
        </Text>
      </View>
    );
  }
  */
  // component states for user voting status and handling votes
  const { requireAuth } = useRequireAuth();
  const handleVote = async (charityId, charityName: string) => {
    requireAuth(() => {
     Alert.alert("Are you sure?", `You are about to vote for ${charityName}. You can only vote once per week.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Vote", onPress: async () => {
        setVotingFor(charityId);
        // Here we would send the vote to the backend
        Alert.alert("Thank you for voting!", `Your vote for ${charityName} has been recorded.`);
        setUserHasVoted(true);
        }},
      ]);
    }); 
  };
  const [userHasVoted, setUserHasVoted] = useState(false);  

  // error state for fetching charities
  const [error, setError] = useState(null);

  if (error) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.error }}>Failed to load charities</Text>
        <TouchableOpacity onPress={loadCharities}>
          <Text style={{ color: colors.primary }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /*when backend is ready, use this to get real charity data
  useEffect(() => {
    loadCharities();
    checkVoteStatus();
  }, []);

  async function loadCharities() {
    setLoading(true);
    try {
      const response = await fetch('your-api/charities/current-week');
      const data = await response.json();
      setCharities(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkVoteStatus() {
    // Check if user already voted this week
    const response = await fetch('your-api/vote/status');
    const { hasVoted } = await response.json();
    setUserHasVoted(hasVoted);
  }

  */

  return (
    <View style={styles.container}>
      
      <ScrollView style={styles.charityList}>
        <Text style={styles.header}>This week's Charity Spotlight</Text>
        {userHasVoted && <Text style={styles.userVoteStatus}>You have voted this week. Come back next week to vote again.</Text>}
        {charities.map((charity) => (
          <View key={charity.id} style={styles.charityCard}>
            <Image source={{ uri: charity.image }} style={styles.charityImage} />
            <Text style={styles.charityCategory}>{charity.category}</Text>
            <Text style={styles.charityName}>{charity.name}</Text>
            <Text style={styles.charityDescription}>{charity.description}</Text>
            <TouchableOpacity 
              style={[styles.voteButton, userHasVoted && styles.voteButtonDisabled]}
              onPress={() => handleVote(charity.id, charity.name)}
              disabled={userHasVoted || votingFor === charity.id}
              >
              <Text style={styles.voteButtonText}>
                {votingFor === charity.id ? "Your vote" : userHasVoted ? "Voted" : "Vote "} <Ionicons name="heart" size={16} color={colors.white} />
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl, 
  },
  header: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userVoteStatus: {
     fontSize: typography.sizes.sm,
     color: colors.white,
     textAlign: 'center',
     fontSize: typography.sizes.md,
     marginBottom: spacing.lg,  
  },
  charityList: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  charityCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  charityImage: {
    width: '100%',
    height: 200,
    marginBottom: spacing.lg,
  },
  charityName: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  charityCategory: {
    fontSize: typography.sizes.sm,
    color: colors.textLight,
    backgroundColor: colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },  
  charityDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textLight,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  voteButton: {
    backgroundColor: colors.secondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    width: '50%',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  voteButtonText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semiBold,
  },
  voteButtonDisabled: {
  backgroundColor: colors.textLight,
  opacity: 0.5,
  },
});