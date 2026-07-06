import { useAppConfig } from '@/contexts/appConfigContext';
import { supabase } from '@/services/supabase';
import RetryState from '@/src/components/RetryState';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { usePostHog } from 'posthog-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRequireAuth } from '../../hooks/useRequiredAuth';

type SearchResult = {
  name: string;
  ein: string;
  city: string | null;
  state: string | null;
  inDatabase: boolean;
};

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [votingFor, setVotingFor] = useState(null);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charities, setCharities] = useState([]);
  const [currentPeriodId, setCurrentPeriodId] = useState(null);

  // search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [nominatingEin, setNominatingEin] = useState<string | null>(null);

  const { requireAuth } = useRequireAuth();
  const posthog = usePostHog();
  const { config } = useAppConfig();

  useEffect(() => {
    loadCharities();
    checkVoteStatus();
  }, []);

  async function loadCharities() {
    setLoading(true);
    setError(null);
    try {
      const { data: period, error: periodError } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('is_closed', false)
        .lte('start_date', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (periodError || !period) {
        setError('No active voting period. Please check back later.');
        setLoading(false);
        return;
      }

      setCurrentPeriodId(period.id);

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

      const charityList = periodCharities.map((item) => item.charities);
      setCharities(charityList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkVoteStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: period } = await supabase
        .from('voting_periods')
        .select('id')
        .eq('is_closed', false)
        .lte('start_date', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!period) return;

      const { data: vote } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', user.id)
        .eq('voting_period_id', period.id)
        .single();

      setUserHasVoted(!!vote);
    } catch (err) {
      console.log('Vote status check:', err.message);
    }
  }

  const handleSearch = async () => {
    Keyboard.dismiss();
    const query = searchQuery.trim();
    if (query.length < 2) {
      Alert.alert('Search', 'Please enter at least 2 characters.');
      return;
    }
    if (query.length > 100) {
      Alert.alert('Search', 'Search query is too long (max 100 characters).');
      return;
    }

    requireAuth(async () => {
      setIsSearching(true);
      setSearchResults(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('search-charities', {
          body: { query },
        });

        if (fnError) throw fnError;
        const results = data.results ?? [];
        setSearchResults(results);
        posthog.capture('charity_search_performed', {
          query,
          result_count: results.length,
        });
      } catch (err) {
        Alert.alert('Search Error', 'Failed to search charities. Please try again.');
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    });
  };

  const handleNominate = (result: SearchResult) => {
    if (!config.nominations_enabled) {
      Alert.alert('Nominations Closed', 'Charity nominations are temporarily closed. Check back soon.');
      return;
    }
    requireAuth(() => {
      Alert.alert(
        'Nominate Charity',
        `Nominate "${result.name}" (EIN: ${result.ein}) for consideration?\n\nAdmin will review before it becomes eligible for voting.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Nominate',
            onPress: async () => {
              setNominatingEin(result.ein);
              try {
                const { data, error: fnError } = await supabase.functions.invoke(
                  'validate-and-nominate',
                  { body: { ein: result.ein, name: result.name } }
                );

                if (fnError) {
                  // try to extract the JSON error message from the response body
                  let msg = 'Failed to submit nomination.';
                  try {
                    const body = await (fnError as any).context?.json?.();
                    msg = body?.error ?? fnError.message ?? msg;
                  } catch {
                    msg = fnError.message ?? msg;
                  }
                  Alert.alert('Error', msg);
                  return;
                }

                posthog.capture('charity_nomination_submitted', {
                  charity_name: data.charityName,
                  ein: result.ein,
                });
                Alert.alert(
                  'Nomination Submitted!',
                  `Your nomination for ${data.charityName} has been submitted for admin review.`
                );
                handleSearch();
              } catch (err: any) {
                Alert.alert('Error', err?.message ?? 'Failed to submit nomination.');
              } finally {
                setNominatingEin(null);
              }
            },
          },
        ]
      );
    });
  };

  const handleVote = async (charityId: string, charityName: string) => {
    if (!config.voting_enabled) {
      Alert.alert('Voting Paused', 'Voting is temporarily paused. Check back soon.');
      return;
    }
    requireAuth(() => {
      if (!currentPeriodId) {
        Alert.alert(
          'Voting Unavailable',
          'A new voting period is being prepared. Please try again in a few minutes.'
        );
        return;
      }
      Alert.alert(
        'Are you sure?',
        `You are about to vote for ${charityName}. You can only vote once per week.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Vote',
            onPress: async () => {
              setVotingFor(charityId);
              try {
                const { data: { user } } = await supabase.auth.getUser();

                const { error } = await supabase.from('votes').insert({
                  user_id: user.id,
                  charity_id: charityId,
                  voting_period_id: currentPeriodId,
                });

                if (error) throw error;

                posthog.capture('charity_vote_cast', {
                  charity_id: charityId,
                  charity_name: charityName,
                  voting_period_id: currentPeriodId,
                });
                Alert.alert('Thank you for voting!', `Your vote for ${charityName} has been recorded.`);
                setUserHasVoted(true);
              } catch (err) {
                Alert.alert('Error', 'Failed to cast vote. Please try again.');
                console.error(err.message);
              } finally {
                setVotingFor(null);
              }
            },
          },
        ]
      );
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text, marginTop: spacing.md }}>Loading charities...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <RetryState
          tone="light"
          title="Couldn't load charities"
          message={error === 'No active voting period. Please check back later.' ? error : 'Check your connection and try again.'}
          onRetry={loadCharities}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* search bar — always visible */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search charities by name or EIN..."
          placeholderTextColor={colors.primaryDark}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchResults !== null && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.searchButton, isSearching && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="search" size={18} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      {(!config.voting_enabled || !config.nominations_enabled) && (
        <View style={styles.featureBanner}>
          <Ionicons name="warning-outline" size={15} color={colors.warning} />
          <View style={{ flex: 1 }}>
            {!config.voting_enabled && (
              <Text style={styles.featureBannerText}>Voting is temporarily paused</Text>
            )}
            {!config.nominations_enabled && (
              <Text style={styles.featureBannerText}>Charity nominations are closed</Text>
            )}
          </View>
        </View>
      )}

      <ScrollView style={styles.charityList} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        {/* search Results */}
        {searchResults !== null && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsHeader}>
              Search Results{searchResults.length > 0 ? ` (${searchResults.length})` : ''}
            </Text>

            {searchResults.length === 0 ? (
              <View style={styles.resultCard}>
                <Text style={styles.noResultsText}>No charities found for &quot;{searchQuery}&quot;.</Text>
              </View>
            ) : (
              searchResults.map((result) => (
                <TouchableOpacity
                  key={result.ein}
                  style={styles.resultCard}
                  onPress={() => !result.inDatabase && handleNominate(result)}
                  disabled={result.inDatabase || nominatingEin === result.ein}
                  activeOpacity={result.inDatabase ? 1 : 0.7}
                >
                  <View style={styles.resultRow}>
                    {/* logo placeholder or question mark */}
                    <View style={styles.resultIconContainer}>
                      {result.inDatabase ? (
                        <Ionicons name="checkmark-circle" size={32} color={colors.success} />
                      ) : (
                        <Ionicons name="help-circle-outline" size={32} color={colors.textSecondary} />
                      )}
                    </View>

                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{result.name}</Text>
                      <Text style={styles.resultEin}>EIN: {result.ein}</Text>
                      {(result.city || result.state) && (
                        <Text style={styles.resultLocation}>
                          {[result.city, result.state].filter(Boolean).join(', ')}
                        </Text>
                      )}
                    </View>

                    <View style={styles.resultAction}>
                      {result.inDatabase ? (
                        <View style={styles.listedBadge}>
                          <Text style={styles.listedBadgeText}>Listed</Text>
                        </View>
                      ) : nominatingEin === result.ein ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : !config.nominations_enabled ? (
                        <View style={styles.nominateClosedBadge}>
                          <Text style={styles.nominateClosedBadgeText}>Closed</Text>
                        </View>
                      ) : (
                        <View style={styles.nominateBadge}>
                          <Text style={styles.nominateBadgeText}>Nominate</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* weekly Voting Section */}
        <Text style={styles.header}>Charity Spotlight</Text>
        {userHasVoted && (
          <Text style={styles.userVoteStatus}>
            You have voted this week. Come back next week to vote again.
          </Text>
        )}

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
              style={[styles.voteButton, (userHasVoted || !config.voting_enabled) && styles.voteButtonDisabled]}
              onPress={() => handleVote(charity.id, charity.name)}
              disabled={userHasVoted || votingFor === charity.id || !config.voting_enabled}
            >
              <Text style={styles.voteButtonText}>
                {votingFor === charity.id ? 'Your vote' : userHasVoted ? 'Voted' : !config.voting_enabled ? 'Paused' : 'Vote '}
                {!userHasVoted && config.voting_enabled && <Ionicons name="heart" size={16} color={colors.white} />}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md as number,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearButton: {
    padding: spacing.xs,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  resultsContainer: {
    marginBottom: spacing.md,
  },
  resultsHeader: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  resultCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultIconContainer: {
    width: 40,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
    color: colors.text,
    marginBottom: 2,
  },
  resultEin: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textSecondary,
  },
  resultLocation: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
  resultAction: {
    marginLeft: spacing.sm,
    alignItems: 'center',
  },
  listedBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  listedBadgeText: {
    color: colors.white,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
  },
  nominateBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  nominateBadgeText: {
    color: colors.white,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: typography.weights.semiBold,
  },
  featureBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(243, 156, 18, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderRadius: borderRadius.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  featureBannerText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_500Medium',
    color: colors.warning,
  },
  nominateClosedBadge: {
    backgroundColor: 'rgba(191, 163, 128, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  nominateClosedBadgeText: {
    color: colors.primaryLight,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
  },
  noResultsText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  header: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userVoteStatus: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_400Regular',
    color: colors.white,
    textAlign: 'center',
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
    fontFamily: 'Fredoka_700Bold',
    fontWeight: typography.weights.bold,
    color: colors.text,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  charityCategory: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
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
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    alignSelf: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
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
    fontFamily: 'Fredoka_600SemiBold',
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
    fontFamily: 'Fredoka_400Regular',
    textDecorationLine: 'underline',
  },
});
