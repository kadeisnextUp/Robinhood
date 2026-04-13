import { useAuth } from '@/contexts/authContext';
import { supabase } from '@/services/supabase';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';


export default function AdminScreen() {
  const { session } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // donation form state
  const [donationAmount, setDonationAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);

  // charity management state
  const [charities, setCharities] = useState([]);

  // pending nominations state
  const [pendingNominations, setPendingNominations] = useState<any[]>([]);
  const [nominationActionLoading, setNominationActionLoading] = useState<string | null>(null);

  // record donation refs
  const transactionIdRef = useRef<TextInput>(null);
  const proofUrlRef = useRef<TextInput>(null);
  // edit donation refs
  const editTransactionIdRef = useRef<TextInput>(null);
  const editProofUrlRef = useRef<TextInput>(null);
  // import refs
  const importStateRef = useRef<TextInput>(null);
  const importCityRef = useRef<TextInput>(null);
  const importCountRef = useRef<TextInput>(null);

  // import from CharityAPI state
  const [showImport, setShowImport] = useState(false);
  const [importQuery, setImportQuery] = useState('');
  const [importState, setImportState] = useState('');
  const [importCity, setImportCity] = useState('');
  const [importCount, setImportCount] = useState('10');

  const [importLoading, setImportLoading] = useState(false);

  // donations history state
  const [donationsHistory, setDonationsHistory] = useState([]);
  const [editingDonation, setEditingDonation] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editTransactionId, setEditTransactionId] = useState('');
  const [editProofUrl, setEditProofUrl] = useState('');

  useEffect(() => {
    if (session) {
      checkAdminAccess();
    } else {
      setLoading(false);
    }
  }, [session]);

  const checkAdminAccess = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', session.user.id)
        .single();

      if (error) throw error;

      setIsAdmin(data.is_admin);

      if (data.is_admin) {
        await Promise.all([loadPeriods(), loadCharities(), loadDonationsHistory(), loadPendingNominations()]);
      }
    } catch (err) {
      console.error('Admin check error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriods = async () => {
    try {
      const { data: openPeriod } = await supabase
        .from('voting_periods')
        .select(`
          id,
          start_date,
          end_date,
          is_closed,
          winner_charity_id,
          charities (name)
        `)
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      setCurrentPeriod(openPeriod);

      const { data: closed } = await supabase
        .from('voting_periods')
        .select(`
          id,
          start_date,
          end_date,
          winner_charity_id,
          charities (
            id,
            name
          )
        `)
        .eq('is_closed', true)
        .not('winner_charity_id', 'is', null)
        .order('end_date', { ascending: false });

      const { data: existingDonations } = await supabase
        .from('donations')
        .select('voting_period_id');

      const donatedPeriodIds = existingDonations?.map((d) => d.voting_period_id) ?? [];
      const pendingDonations = closed?.filter(
        (p) => !donatedPeriodIds.includes(p.id)
      ) ?? [];

      setClosedPeriods(pendingDonations);
    } catch (err) {
      console.error('Load periods error:', err);
    }
  };

  const handleCreatePeriod = async () => {
    Alert.alert(
      'Create Voting Period',
      'Are you sure you want to create a new voting period now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            setActionLoading(true);
            try {
              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-voting-period`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
                  },
                  body: JSON.stringify({}),
                }
              );

              const result = await response.json();
              if (!result.success) throw new Error(result.error);

              Alert.alert('Success', 'New voting period created!');
              await loadPeriods();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to create voting period');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleClosePeriod = async () => {
    Alert.alert(
      'Close Voting Period',
      'Are you sure you want to close the current voting period and declare a winner?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Period',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/close-voting-period`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
                  },
                  body: JSON.stringify({ force: true, period_id: currentPeriod.id }),
                }
              );

              const result = await response.json();
              if (!result.success) throw new Error(result.error);

              Alert.alert('Success', `Voting period closed. Winner declared!`);
              await loadPeriods();
            } catch (err) {
              Alert.alert('Error', JSON.stringify(err) || 'Something went wrong');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const loadCharities = async () => {
    try {
      const { data, error } = await supabase
        .from('charities')
        .select('id, name, category, is_approved')
        .eq('is_approved', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setCharities(data ?? []);
    } catch (err) {
      console.error('Load charities error:', err);
    }
  };

  const loadPendingNominations = async () => {
    try {
      const { data, error } = await supabase
        .from('charities')
        .select(`
          id, name, ein, description, logo_url, website_url, category,
          nominations(id, status)
        `)
        .eq('is_approved', false);

      if (error) throw error;

      // Only show charities that have at least one pending nomination
      const withPending = (data ?? []).filter((c: any) =>
        c.nominations?.some((n: any) => n.status === 'pending')
      );

      setPendingNominations(withPending);
    } catch (err) {
      console.error('Load pending nominations error:', err);
    }
  };

  const isCharityComplete = (charity: any) =>
    !!(
      charity.name?.trim() &&
      charity.ein?.trim() &&
      charity.description?.trim() &&
      charity.logo_url?.trim() &&
      charity.website_url?.trim() &&
      charity.category?.trim()
    );

  const handleApproveNomination = async (charityId: string, charityName: string) => {
    Alert.alert(
      'Approve Charity',
      `Approve "${charityName}" and make it eligible for voting?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setNominationActionLoading(charityId + '_approve');
            try {
              const { error } = await supabase.functions.invoke('approve-charity', {
                body: { charity_id: charityId },
              });
              if (error) throw error;
              Alert.alert('Approved', `${charityName} is now pool-eligible. Nominators have been notified.`);
              await Promise.all([loadCharities(), loadPendingNominations()]);
            } catch (err: any) {
              Alert.alert('Error', err?.context?.error ?? err?.message ?? 'Failed to approve charity.');
            } finally {
              setNominationActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleRejectNomination = async (charityId: string, charityName: string) => {
    Alert.alert(
      'Reject Charity',
      `Reject the nomination for "${charityName}"? Nominators will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setNominationActionLoading(charityId + '_reject');
            try {
              const { error } = await supabase.functions.invoke('reject-charity', {
                body: { charity_id: charityId },
              });
              if (error) throw error;
              Alert.alert('Rejected', `Nomination for ${charityName} has been rejected. Nominators have been notified.`);
              await loadPendingNominations();
            } catch (err: any) {
              Alert.alert('Error', err?.context?.error ?? err?.message ?? 'Failed to reject charity.');
            } finally {
              setNominationActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const loadDonationsHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`
          id,
          amount,
          donated_at,
          transaction_id,
          proof_url,
          charities (name)
        `)
        .order('donated_at', { ascending: false });

      if (error) throw error;
      setDonationsHistory(data ?? []);
    } catch (err) {
      console.error('Load donations history error:', err);
    }
  };

  const handleRecordDonation = async () => {
    if (!selectedPeriodId) {
      Alert.alert('Error', 'Please select a voting period.');
      return;
    }
    if (!donationAmount || isNaN(parseFloat(donationAmount))) {
      Alert.alert('Error', 'Please enter a valid donation amount.');
      return;
    }
    if (!proofUrl) {
      Alert.alert('Error', 'Please enter a proof URL.');
      return;
    }

    const period = closedPeriods.find((p) => p.id === selectedPeriodId);

    Alert.alert(
      'Record Donation',
      `Record a $${donationAmount} donation to ${period?.charities?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          onPress: async () => {
            setActionLoading(true);
            try {
              const { error } = await supabase
                .from('donations')
                .insert({
                  voting_period_id: selectedPeriodId,
                  charity_id: period.winner_charity_id,
                  amount: parseFloat(donationAmount),
                  transaction_id: transactionId || null,
                  proof_url: proofUrl,
                  donated_at: new Date().toISOString(),
                });

              if (error) throw error;

              Alert.alert('Success', 'Donation recorded successfully!');
              setDonationAmount('');
              setTransactionId('');
              setProofUrl('');
              setSelectedPeriodId(null);
              await loadPeriods();
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleToggleApproval = async (charityId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('charities')
        .update({ is_approved: !currentStatus })
        .eq('id', charityId);

      if (error) throw error;
      await loadCharities();
    } catch (err) {
      Alert.alert('Error', 'Failed to update charity status.');
    }
  };

  const handleImportCharities = async () => {
    const count = parseInt(importCount, 10);
    if (isNaN(count) || count < 1 || count > 50) {
      Alert.alert('Error', 'Please enter a count between 1 and 50.');
      return;
    }
    if (!importQuery.trim()) {
      Alert.alert('Error', 'Please enter a search term or EIN.');
      return;
    }

    Alert.alert(
      'Import Charities',
      `Import up to ${count} charities matching "${importQuery.trim()}" from CharityAPI?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setImportLoading(true);
            try {
              const body: any = { query: importQuery.trim(), count };
              if (importState.trim()) body.state = importState.trim().toUpperCase();
              if (importCity.trim()) body.city = importCity.trim();

              const { data, error } = await supabase.functions.invoke('import-charities', { body });

              if (error) throw error;

              Alert.alert(
                'Import Complete',
                `${data.inserted} ${data.inserted === 1 ? 'charity' : 'charities'} imported and pending approval.`
              );
              setImportQuery('');
              setImportState('');
              setImportCity('');
              setImportCount('10');
              setShowImport(false);
              await loadPendingNominations();
            } catch (err) {
              Alert.alert('Error', err.message || 'Import failed.');
            } finally {
              setImportLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEditDonation = async () => {
    if (!editAmount || isNaN(parseFloat(editAmount))) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }
    if (!editProofUrl.trim()) {
      Alert.alert('Error', 'Please enter a proof URL.');
      return;
    }

    try {
      const { error } = await supabase
        .from('donations')
        .update({
          amount: parseFloat(editAmount),
          transaction_id: editTransactionId || null,
          proof_url: editProofUrl.trim(),
        })
        .eq('id', editingDonation.id);

      if (error) throw error;

      Alert.alert('Success', 'Donation updated successfully!');
      setEditingDonation(null);
      await loadDonationsHistory();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update donation.');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session || !isAdmin) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Access Denied</Text>
        <Text style={styles.errorSubtext}>You don't have permission to view this page.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.push('/(tabs)/profile')}
      >
        <Ionicons name="arrow-back" size={32} color={colors.secondary} />
      </TouchableOpacity>

      <Text style={styles.title}>Admin Panel</Text>

      {!currentPeriod && (
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, actionLoading && styles.buttonDisabled, { width: '75%', paddingVertical: spacing.sm, alignSelf: 'center' }]}
          onPress={handleCreatePeriod}
          disabled={actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Create New Voting Period</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Current Voting Period */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Voting Period</Text>
        {currentPeriod ? (
          <View style={styles.card}>
            <Text style={styles.cardText}>
              {formatDate(currentPeriod.start_date)} — {formatDate(currentPeriod.end_date)}
            </Text>
            <Text style={styles.cardSubtext}>Status: Open</Text>
            <TouchableOpacity
              style={[styles.button, styles.dangerButton, actionLoading && styles.buttonDisabled]}
              onPress={handleClosePeriod}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Close Voting Period</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>No open voting period found.</Text>
          </View>
        )}
      </View>

      {/* Record Donation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Record Donation</Text>
        {closedPeriods.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>No periods awaiting donation recording.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>Select Voting Period</Text>
            {closedPeriods.map((period) => (
              <TouchableOpacity
                key={period.id}
                style={[
                  styles.periodOption,
                  selectedPeriodId === period.id && styles.periodOptionSelected,
                ]}
                onPress={() => setSelectedPeriodId(period.id)}
              >
                <Text style={styles.periodOptionText}>
                  {formatDate(period.start_date)} — {formatDate(period.end_date)}
                </Text>
                <Text style={styles.periodWinner}>
                  Winner: {period.charities?.name ?? 'Unknown'}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.label}>Donation Amount ($)</Text>
            <TextInput
              style={styles.input}
              value={donationAmount}
              onChangeText={setDonationAmount}
              keyboardType="decimal-pad"
              placeholder="e.g. 500.00"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
              onSubmitEditing={() => transactionIdRef.current?.focus()}
              submitBehavior="submit"
            />

            <Text style={styles.label}>Transaction ID (optional)</Text>
            <TextInput
              ref={transactionIdRef}
              style={styles.input}
              value={transactionId}
              onChangeText={setTransactionId}
              placeholder="e.g. pi_3OqX2KJH8example"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
              onSubmitEditing={() => proofUrlRef.current?.focus()}
              submitBehavior="submit"
            />

            <Text style={styles.label}>Proof URL</Text>
            <TextInput
              ref={proofUrlRef}
              style={styles.input}
              value={proofUrl}
              onChangeText={setProofUrl}
              placeholder="e.g. https://drive.google.com/..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleRecordDonation}
            />

            <TouchableOpacity
              style={[styles.button, styles.primaryButton, actionLoading && styles.buttonDisabled]}
              onPress={handleRecordDonation}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Record Donation</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Donations History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Donations History</Text>
        {donationsHistory.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>No donations recorded yet.</Text>
          </View>
        ) : (
          donationsHistory.map((donation) => (
            <View key={donation.id} style={styles.card}>
              {editingDonation?.id === donation.id ? (
                <View>
                  <Text style={styles.cardText}>{donation.charities?.name}</Text>
                  <Text style={styles.label}>Amount ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textSecondary}
                    returnKeyType="next"
                    onSubmitEditing={() => editTransactionIdRef.current?.focus()}
                    submitBehavior="submit"
                  />
                  <Text style={styles.label}>Transaction ID (optional)</Text>
                  <TextInput
                    ref={editTransactionIdRef}
                    style={styles.input}
                    value={editTransactionId}
                    onChangeText={setEditTransactionId}
                    placeholderTextColor={colors.textSecondary}
                    returnKeyType="next"
                    onSubmitEditing={() => editProofUrlRef.current?.focus()}
                    submitBehavior="submit"
                  />
                  <Text style={styles.label}>Proof URL</Text>
                  <TextInput
                    ref={editProofUrlRef}
                    style={styles.input}
                    value={editProofUrl}
                    onChangeText={setEditProofUrl}
                    autoCapitalize="none"
                    placeholderTextColor={colors.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={handleEditDonation}
                  />
                  <View style={styles.rowButtons}>
                    <TouchableOpacity
                      style={[styles.button, styles.primaryButton, styles.halfButton]}
                      onPress={handleEditDonation}
                    >
                      <Text style={styles.buttonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.secondaryButton, styles.halfButton]}
                      onPress={() => setEditingDonation(null)}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.cardText}>{donation.charities?.name}</Text>
                  <Text style={styles.cardSubtext}>
                    ${parseFloat(donation.amount).toFixed(2)} — {formatDate(donation.donated_at)}
                  </Text>
                  {donation.transaction_id && (
                    <Text style={styles.cardSubtext}>TXN: {donation.transaction_id}</Text>
                  )}
                  <Text style={styles.proofUrl} numberOfLines={1}>{donation.proof_url}</Text>
                  <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={() => {
                      setEditingDonation(donation);
                      setEditAmount(donation.amount.toString());
                      setEditTransactionId(donation.transaction_id || '');
                      setEditProofUrl(donation.proof_url || '');
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* Pending Nominations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pending Nominations</Text>
        {pendingNominations.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>No pending nominations.</Text>
          </View>
        ) : (
          pendingNominations.map((charity: any) => {
            const complete = isCharityComplete(charity);
            const nominationCount = charity.nominations?.filter((n: any) => n.status === 'pending').length ?? 0;
            const isApprovingThis = nominationActionLoading === charity.id + '_approve';
            const isRejectingThis = nominationActionLoading === charity.id + '_reject';

            return (
              <View key={charity.id} style={styles.card}>
                <Text style={styles.cardText}>{charity.name}</Text>
                <Text style={styles.cardSubtext}>EIN: {charity.ein ?? 'Not set'}</Text>
                <Text style={styles.cardSubtext}>
                  {nominationCount} user{nominationCount !== 1 ? 's' : ''} nominated this charity
                </Text>
                {!complete && (
                  <Text style={styles.incompleteWarning}>
                    Fill in all fields via Supabase dashboard to enable approval.
                  </Text>
                )}
                <View style={styles.rowButtons}>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.primaryButton,
                      styles.halfButton,
                      (!complete || nominationActionLoading !== null) && styles.buttonDisabled,
                    ]}
                    onPress={() => handleApproveNomination(charity.id, charity.name)}
                    disabled={!complete || nominationActionLoading !== null}
                  >
                    {isApprovingThis ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>Approve</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.dangerButton,
                      styles.halfButton,
                      nominationActionLoading !== null && styles.buttonDisabled,
                    ]}
                    onPress={() => handleRejectNomination(charity.id, charity.name)}
                    disabled={nominationActionLoading !== null}
                  >
                    {isRejectingThis ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>Reject</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Charity Management */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Charity Management</Text>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, styles.smallButton]}
            onPress={() => setShowImport(!showImport)}
          >
            <Text style={styles.buttonText}>{showImport ? 'Cancel' : '↓ Import'}</Text>
          </TouchableOpacity>
        </View>

        {/* Import from CharityAPI */}
        {showImport && (
          <View style={styles.card}>
            <Text style={styles.cardText}>Import from CharityAPI</Text>
            <Text style={styles.cardSubtext}>
              Search by name or EIN. Imports name and EIN only — fill in remaining fields via the Supabase dashboard before approving.
            </Text>

            <Text style={styles.label}>Search Term or EIN (required)</Text>
            <TextInput
              style={styles.input}
              value={importQuery}
              onChangeText={setImportQuery}
              placeholder="e.g. food bank  or  12-3456789"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => importStateRef.current?.focus()}
              submitBehavior="submit"
            />

            <Text style={styles.label}>State (optional, 2-letter code)</Text>
            <TextInput
              ref={importStateRef}
              style={styles.input}
              value={importState}
              onChangeText={setImportState}
              placeholder="e.g. CA"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              maxLength={2}
              returnKeyType="next"
              onSubmitEditing={() => importCityRef.current?.focus()}
              submitBehavior="submit"
            />

            <Text style={styles.label}>City (optional)</Text>
            <TextInput
              ref={importCityRef}
              style={styles.input}
              value={importCity}
              onChangeText={setImportCity}
              placeholder="e.g. Los Angeles"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
              onSubmitEditing={() => importCountRef.current?.focus()}
              submitBehavior="submit"
            />

            <Text style={styles.label}>Number to Import</Text>
            <TextInput
              ref={importCountRef}
              style={styles.input}
              value={importCount}
              onChangeText={setImportCount}
              keyboardType="number-pad"
              placeholder="e.g. 10"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              onSubmitEditing={handleImportCharities}
            />

            <TouchableOpacity
              style={[styles.button, styles.primaryButton, importLoading && styles.buttonDisabled]}
              onPress={handleImportCharities}
              disabled={importLoading}
            >
              {importLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Import Charities</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Charity List */}
        {charities.map((charity) => (
          <View key={charity.id} style={styles.card}>
            <View style={styles.charityRow}>
              <View style={styles.charityInfo}>
                <Text style={styles.cardText}>{charity.name}</Text>
                <Text style={styles.cardSubtext}>{charity.category}</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.approvalBadge,
                  charity.is_approved ? styles.approvedBadge : styles.unapprovedBadge,
                ]}
                onPress={() => handleToggleApproval(charity.id, charity.is_approved)}
              >
                <Text style={styles.approvalBadgeText}>
                  {charity.is_approved ? 'Approved' : 'Unapproved'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.semiBold,
    marginBottom: spacing.xs,
  },
  cardSubtext: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  proofUrl: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: typography.sizes.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerContainer: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  picker: {
    color: colors.text,
  },
  periodOption: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  periodOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  periodOptionText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.semiBold,
  },
  periodWinner: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  button: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  dangerButton: {
    backgroundColor: colors.error,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semiBold,
  },
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: 0,
  },
  halfButton: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semiBold,
  },
  rowButtons: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  charityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charityInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  approvalBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  approvedBadge: {
    backgroundColor: colors.success,
  },
  unapprovedBadge: {
    backgroundColor: colors.error,
  },
  approvalBadgeText: {
    color: colors.white,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semiBold,
  },
  incompleteWarning: {
    fontSize: typography.sizes.xs,
    color: colors.error,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  errorSubtext: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
});