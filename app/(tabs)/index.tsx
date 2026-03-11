import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRequireAuth } from '../../hooks/useRequiredAuth';

export default function HomeScreen() {

  // component states for loading
  const [loading, setLoading] = useState(true);
  const [votingFor, setVotingFor] = useState(null);
  // component states for user voting status and handling votes
  const [userHasVoted, setUserHasVoted] = useState(false);  
  // error state for fetching charities
  const [error, setError] = useState<string | null>(null);
  // component state for charities and current voting period
  const [charities, setCharities] = useState([]);
  const [currentPeriodId, setCurrentPeriodId] = useState(null);

  // auth hook
  const { requireAuth } = useRequireAuth();
  useEffect(() => {
    loadCharities();
    checkVoteStatus();
  }, []);



  // Fetches the current voting period and its 5 charities from Supabase
  async function loadCharities() {
    setLoading(true);
    setError(null);
    try {

      // get the current open voting period
      const { data: period, error: periodError } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

        // if no active period, show message and don't crash
      if (periodError || !period) {
        setError('No active voting period. Please check back later.');
        setLoading(false)
        return;
      }

      setCurrentPeriodId(period.id);

      // get the 5 charities linked to this voting period
      const { data: periodCharities, error: charitiesError } = await supabase
        .from('voting_period_charities')
        .select(`
          charity_id,
          charities (
            id,
            name,
            description,
            category,
            logo_url,
            website_url
          )
        `)
        .eq('voting_period_id', period.id);

      if (charitiesError) throw charitiesError;

      // put the nested charity data into a array
      const charityList = periodCharities.map((item) => item.charities);
      setCharities(charityList);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // check if the current user has already voted this week
  async function checkVoteStatus() {
    try {
      // get the current user
      const { data: { user } } = await supabase.auth.getUser();

      // no need to check vote status if not logged in
      if (!user) return;

      // get the current open voting period
      const { data: period } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!period) return;

      // check if user voted in this period
      const { data: vote } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', user.id)
        .eq('voting_period_id', period.id)
        .single();

      // if a vote record exists, mark the user as having voted
      setUserHasVoted(!!vote);

    } catch (err) {
      // user just hasn't voted this is not a critical error, just log it
      console.log('Vote status check:', err.message);
    }
  }

  // handles the vote action, guards auth, confirms, then writes to Supabase
  const handleVote = async (charityId: string, charityName: string) => {
    requireAuth(() => {
      // Guard against voting when no active period exists
      if (!currentPeriodId) {
        Alert.alert(
          "Voting Unavailable",
          "A new voting period is being prepared. Please try again in a few minutes."
        );
        return;
      }
      Alert.alert(
        "Are you sure?",
        `You are about to vote for ${charityName}. You can only vote once per week.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Vote",
            onPress: async () => {
              setVotingFor(charityId);
              try {
                const { data: { user } } = await supabase.auth.getUser();

                const { error } = await supabase
                  .from('votes')
                  .insert({
                    user_id: user.id,
                    charity_id: charityId,
                    voting_period_id: currentPeriodId,
                  });

                if (error) throw error;

                Alert.alert(
                  "Thank you for voting!",
                  `Your vote for ${charityName} has been recorded.`
                );
                setUserHasVoted(true);

              } catch (err) {
                Alert.alert("Error", "Failed to cast vote. Please try again.");
                console.error(err.message);
              } finally {
                setVotingFor(null);
              }
            }
          },
        ]
      );
    });
  };



  // show loading spinner while fetching charities use when backend is ready
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
  
  
  
  // error state
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

  return (
    <View style={styles.container}>
      
      <ScrollView style={styles.charityList}>
        <Text style={styles.header}>This week's Charity Spotlight</Text>
        {userHasVoted && <Text style={styles.userVoteStatus}>You have voted this week. Come back next week to vote again.</Text>}
        {charities.map((charity) => (
          <View key={charity.id} style={styles.charityCard}>
            <Image source={{ uri: charity.logo_url }} style={styles.charityImage} />
            <Text style={styles.charityCategory}>{charity.category}</Text>
            <Text style={styles.charityName}>{charity.name}</Text>
            <Text style={styles.charityDescription}>{charity.description}</Text>
            {charity.website_url && (
              <TouchableOpacity
                onPress={() => Linking.openURL(charity.website_url)}
                style={styles.websiteButton}
              >
                <Text style={styles.websiteButtonText}>Visit Website →</Text>
              </TouchableOpacity>
            )}
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
    resizeMode: 'contain',
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
  websiteButton: {
  alignSelf: 'center',
  marginBottom: spacing.sm,
  },
  websiteButtonText: {
  color: colors.primary,
  fontSize: typography.sizes.sm,
  textDecorationLine: 'underline',
  },  
});