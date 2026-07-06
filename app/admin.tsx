import { useAppConfig } from '@/contexts/appConfigContext';
import { useAuth } from '@/contexts/authContext';
import { supabase } from '@/services/supabase';
import RetryState from '@/src/components/RetryState';
import { borderRadius, colors, spacing, typography } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';


export default function AdminScreen() {
  const { session } = useAuth();
  const { config, refetch: refetchConfig } = useAppConfig();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState(false);
  const [flagLoading, setFlagLoading] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  const [donationAmount, setDonationAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [proofImageUri, setProofImageUri] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);

  const [charities, setCharities] = useState([]);
  const [pendingNominations, setPendingNominations] = useState<any[]>([]);
  const [nominationActionLoading, setNominationActionLoading] = useState<string | null>(null);

  const transactionIdRef = useRef<TextInput>(null);
  const editTransactionIdRef = useRef<TextInput>(null);
  const importStateRef = useRef<TextInput>(null);
  const importCityRef = useRef<TextInput>(null);
  const importCountRef = useRef<TextInput>(null);

  const [showImport, setShowImport] = useState(false);
  const [importQuery, setImportQuery] = useState('');
  const [importState, setImportState] = useState('');
  const [importCity, setImportCity] = useState('');
  const [importCount, setImportCount] = useState('10');
  const [importLoading, setImportLoading] = useState(false);

  const [donationsHistory, setDonationsHistory] = useState([]);
  const [editingDonation, setEditingDonation] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editTransactionId, setEditTransactionId] = useState('');
  const [editProofImageUri, setEditProofImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      checkAdminAccess();
    } else {
      setLoading(false);
    }
  }, [session]);

  const checkAdminAccess = async () => {
    setLoading(true);
    setAccessError(false);
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
      setAccessError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriods = async () => {
    try {
      const { data: openPeriod } = await supabase
        .from('voting_periods')
        .select(`id, start_date, end_date, is_closed, winner_charity_id, charities (name)`)
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      setCurrentPeriod(openPeriod);

      const { data: closed } = await supabase
        .from('voting_periods')
        .select(`id, start_date, end_date, winner_charity_id, charities (id, name)`)
        .eq('is_closed', true)
        .not('winner_charity_id', 'is', null)
        .order('end_date', { ascending: false });

      const { data: existingDonations } = await supabase
        .from('donations')
        .select('voting_period_id');

      const donatedPeriodIds = existingDonations?.map((d) => d.voting_period_id) ?? [];
      setClosedPeriods(closed?.filter((p) => !donatedPeriodIds.includes(p.id)) ?? []);
    } catch (err) {
      console.error('Load periods error:', err);
      Alert.alert('Error', 'Failed to load voting periods.');
    }
  };

  const handleCreatePeriod = async () => {
    Alert.alert('Create Voting Period', 'Are you sure you want to create a new voting period now?', [
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
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}` },
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
    ]);
  };

  const handleClosePeriod = async () => {
    Alert.alert('Close Voting Period', 'Are you sure you want to close the current voting period and declare a winner?', [
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
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}` },
                body: JSON.stringify({ force: true, period_id: currentPeriod.id }),
              }
            );
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            Alert.alert('Success', 'Voting period closed. Winner declared!');
            await loadPeriods();
          } catch (err) {
            Alert.alert('Error', JSON.stringify(err) || 'Something went wrong');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
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
      Alert.alert('Error', 'Failed to load charities.');
    }
  };

  const loadPendingNominations = async () => {
    try {
      const { data, error } = await supabase
        .from('charities')
        .select(`id, name, ein, description, logo_url, website_url, category, nominations(id, status)`)
        .eq('is_approved', false);
      if (error) throw error;
      const withPending = (data ?? []).filter((c: any) =>
        c.nominations?.some((n: any) => n.status === 'pending')
      );
      setPendingNominations(withPending);
    } catch (err) {
      console.error('Load pending nominations error:', err);
      Alert.alert('Error', 'Failed to load pending nominations.');
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
    Alert.alert('Approve Charity', `Approve "${charityName}" and make it eligible for voting?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setNominationActionLoading(charityId + '_approve');
          try {
            const { error } = await supabase.functions.invoke('approve-charity', { body: { charity_id: charityId } });
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
    ]);
  };

  const handleRejectNomination = async (charityId: string, charityName: string) => {
    Alert.alert('Reject Charity', `Reject the nomination for "${charityName}"? Nominators will be notified.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setNominationActionLoading(charityId + '_reject');
          try {
            const { error } = await supabase.functions.invoke('reject-charity', { body: { charity_id: charityId } });
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
    ]);
  };

  const loadDonationsHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`id, amount, donated_at, transaction_id, proof_url, charities (name)`)
        .order('donated_at', { ascending: false });
      if (error) throw error;
      setDonationsHistory(data ?? []);
    } catch (err) {
      console.error('Load donations history error:', err);
      Alert.alert('Error', 'Failed to load donations history.');
    }
  };

  const pickProofImage = async (onPicked: (uri: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to upload a screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) onPicked(result.assets[0].uri);
  };

  const uploadProofImage = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const filename = `${Date.now()}.jpg`;
    const { data, error } = await supabase.storage
      .from('donation-proofs')
      .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    const { data: { publicUrl } } = supabase.storage.from('donation-proofs').getPublicUrl(data.path);
    return publicUrl;
  };

  const handleRecordDonation = async () => {
    if (!selectedPeriodId) { Alert.alert('Error', 'Please select a voting period.'); return; }
    if (!donationAmount || isNaN(parseFloat(donationAmount))) { Alert.alert('Error', 'Please enter a valid donation amount.'); return; }
    const period = closedPeriods.find((p) => p.id === selectedPeriodId);
    Alert.alert('Record Donation', `Record a $${donationAmount} donation to ${period?.charities?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Record',
        onPress: async () => {
          setActionLoading(true);
          try {
            let proofUrl: string | null = null;
            if (proofImageUri) proofUrl = await uploadProofImage(proofImageUri);
            const { error } = await supabase.functions.invoke('record-donation', {
              body: {
                voting_period_id: selectedPeriodId,
                charity_id: period.winner_charity_id,
                amount: parseFloat(donationAmount),
                transaction_id: transactionId || null,
                proof_url: proofUrl,
              },
            });
            if (error) throw error;
            Alert.alert('Success', 'Donation recorded and users notified!');
            setDonationAmount('');
            setTransactionId('');
            setProofImageUri(null);
            setSelectedPeriodId(null);
            await loadPeriods();
          } catch (err) {
            Alert.alert('Error', err.message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleToggleApproval = async (charityId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from('charities').update({ is_approved: !currentStatus }).eq('id', charityId);
      if (error) throw error;
      await loadCharities();
    } catch (err) {
      Alert.alert('Error', 'Failed to update charity status.');
    }
  };

  const handleImportCharities = async () => {
    const count = parseInt(importCount, 10);
    if (isNaN(count) || count < 1 || count > 50) { Alert.alert('Error', 'Please enter a count between 1 and 50.'); return; }
    if (!importQuery.trim()) { Alert.alert('Error', 'Please enter a search term or EIN.'); return; }
    Alert.alert('Import Charities', `Import up to ${count} charities matching "${importQuery.trim()}" from CharityAPI?`, [
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
            Alert.alert('Import Complete', `${data.inserted} ${data.inserted === 1 ? 'charity' : 'charities'} imported and pending approval.`);
            setImportQuery(''); setImportState(''); setImportCity(''); setImportCount('10'); setShowImport(false);
            await loadPendingNominations();
          } catch (err) {
            Alert.alert('Error', err.message || 'Import failed.');
          } finally {
            setImportLoading(false);
          }
        },
      },
    ]);
  };

  const handleEditDonation = async () => {
    if (!editAmount || isNaN(parseFloat(editAmount))) { Alert.alert('Error', 'Please enter a valid amount.'); return; }
    try {
      let proofUrl: string | null = editingDonation.proof_url ?? null;
      if (editProofImageUri) proofUrl = await uploadProofImage(editProofImageUri);
      const { error } = await supabase.from('donations').update({
        amount: parseFloat(editAmount),
        transaction_id: editTransactionId || null,
        proof_url: proofUrl,
      }).eq('id', editingDonation.id);
      if (error) throw error;
      Alert.alert('Success', 'Donation updated successfully!');
      setEditingDonation(null);
      setEditProofImageUri(null);
      await loadDonationsHistory();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update donation.');
    }
  };

  const handleToggleFeature = async (feature: string, currentValue: boolean) => {
    setFlagLoading(feature);
    try {
      const { error } = await supabase.functions.invoke('toggle-feature', {
        body: { feature, enabled: !currentValue },
      });
      if (error) throw error;
      await refetchConfig();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update feature.');
    } finally {
      setFlagLoading(null);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  if (accessError) {
    return (
      <View style={styles.errorContainer}>
        <RetryState
          tone="light"
          title="Couldn't verify access"
          message="Check your connection and try again."
          onRetry={checkAdminAccess}
        />
      </View>
    );
  }

  if (!session || !isAdmin) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="lock-closed" size={48} color={colors.primaryLight} />
        <Text style={styles.errorTitle}>Access Denied</Text>
        <Text style={styles.errorSubtitle}>You don&apos;t have permission to view this page.</Text>
      </View>
    );
  }

  return (
    <View style={styles.pageContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(tabs)/profile')}>
          <Ionicons name="arrow-back" size={22} color={colors.cardBackground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </View>

      {/* Stats Strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{currentPeriod ? 'Open' : 'None'}</Text>
          <Text style={styles.statLabel}>Period</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{closedPeriods.length}</Text>
          <Text style={styles.statLabel}>Pending Donations</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{pendingNominations.length}</Text>
          <Text style={styles.statLabel}>Reviews</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Feature Flags */}
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Ionicons name="toggle-outline" size={13} color={colors.primaryLight} />
            <Text style={styles.sectionLabel}>FEATURE FLAGS</Text>
          </View>
          <View style={styles.card}>
            {([
              { key: 'voting_enabled', label: 'Voting', icon: 'checkmark-circle-outline', desc: 'Allow users to cast votes' },
              { key: 'donating_enabled', label: 'Donations', icon: 'cash-outline', desc: 'Allow PayPal donations' },
              { key: 'nominations_enabled', label: 'Nominations', icon: 'flag-outline', desc: 'Allow charity nominations' },
              { key: 'maintenance_mode', label: 'Maintenance Mode', icon: 'construct-outline', desc: 'Show maintenance screen to all users' },
            ] as const).map((flag, idx) => {
              const value = !!config[flag.key];
              const isMaintenance = flag.key === 'maintenance_mode';
              return (
                <View key={flag.key}>
                  <View style={styles.flagRow}>
                    <View style={styles.flagInfo}>
                      <View style={styles.flagLabelRow}>
                        <Ionicons name={flag.icon} size={14} color={colors.primary} style={{ marginRight: 6 }} />
                        <Text style={styles.flagLabel}>{flag.label}</Text>
                        {isMaintenance && value && (
                          <View style={styles.flagActivePill}>
                            <Text style={styles.flagActivePillText}>ACTIVE</Text>
                          </View>
                        )}
                        {!isMaintenance && !value && (
                          <View style={styles.flagDisabledPill}>
                            <Text style={styles.flagDisabledPillText}>OFF</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.flagDesc}>{flag.desc}</Text>
                    </View>
                    {flagLoading === flag.key ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Switch
                        value={value}
                        onValueChange={() => handleToggleFeature(flag.key, value)}
                        trackColor={{ false: colors.border, true: isMaintenance ? colors.error : colors.success }}
                        thumbColor={colors.white}
                        disabled={flagLoading !== null}
                      />
                    )}
                  </View>
                  {idx < 3 && <View style={styles.rowDivider} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* Voting Period */}
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.primaryLight} />
            <Text style={styles.sectionLabel}>VOTING PERIOD</Text>
          </View>
          {currentPeriod ? (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle}>
                    {formatDate(currentPeriod.start_date)} — {formatDate(currentPeriod.end_date)}
                  </Text>
                  <Text style={styles.cardMeta}>Active window</Text>
                </View>
                <View style={styles.statusPill}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusPillText}>Open</Text>
                </View>
              </View>
              <View style={styles.internalDivider} />
              <TouchableOpacity
                style={[styles.dangerBtn, actionLoading && styles.btnDisabled]}
                onPress={handleClosePeriod}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <View style={styles.btnInner}>
                    <Ionicons name="lock-closed-outline" size={15} color={colors.white} />
                    <Text style={styles.dangerBtnText}>Close Voting Period</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.emptyRow}>
                <Ionicons name="calendar-clear-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.emptyText}>No active voting period</Text>
              </View>
              <View style={styles.internalDivider} />
              <TouchableOpacity
                style={[styles.primaryBtn, actionLoading && styles.btnDisabled]}
                onPress={handleCreatePeriod}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <View style={styles.btnInner}>
                    <Ionicons name="add-circle-outline" size={15} color={colors.white} />
                    <Text style={styles.primaryBtnText}>Create New Voting Period</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Record Donation */}
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Ionicons name="cash-outline" size={13} color={colors.primaryLight} />
            <Text style={styles.sectionLabel}>RECORD DONATION</Text>
          </View>
          {closedPeriods.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.emptyText}>All donations are up to date</Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Select Voting Period</Text>
              {closedPeriods.map((period) => (
                <TouchableOpacity
                  key={period.id}
                  style={[styles.periodItem, selectedPeriodId === period.id && styles.periodItemSelected]}
                  onPress={() => setSelectedPeriodId(period.id)}
                >
                  <View style={styles.periodItemLeft}>
                    <View style={[styles.radioCircle, selectedPeriodId === period.id && styles.radioCircleSelected]}>
                      {selectedPeriodId === period.id && <View style={styles.radioDot} />}
                    </View>
                    <View>
                      <Text style={styles.periodItemDates}>
                        {formatDate(period.start_date)} — {formatDate(period.end_date)}
                      </Text>
                      <Text style={styles.periodItemWinner}>{period.charities?.name ?? 'Unknown'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}

              <View style={styles.internalDivider} />

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Donation Amount ($)</Text>
                <TextInput
                  style={styles.textInput}
                  value={donationAmount}
                  onChangeText={setDonationAmount}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 500.00"
                  placeholderTextColor={colors.primaryLight}
                  returnKeyType="next"
                  onSubmitEditing={() => transactionIdRef.current?.focus()}
                  submitBehavior="submit"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Transaction ID</Text>
                <TextInput
                  ref={transactionIdRef}
                  style={styles.textInput}
                  value={transactionId}
                  onChangeText={setTransactionId}
                  placeholder="e.g. 5TG87364XY829284K"
                  placeholderTextColor={colors.primaryLight}
                  returnKeyType="done"
                  onSubmitEditing={handleRecordDonation}
                  submitBehavior="submit"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PayPal Confirmation Screenshot</Text>
                <TouchableOpacity
                  style={[styles.outlineBtn, proofImageUri && styles.outlineBtnSuccess]}
                  onPress={() => pickProofImage(setProofImageUri)}
                >
                  <View style={styles.btnInner}>
                    <Ionicons
                      name={proofImageUri ? 'checkmark-circle' : 'cloud-upload-outline'}
                      size={16}
                      color={proofImageUri ? colors.success : colors.primary}
                    />
                    <Text style={[styles.outlineBtnText, proofImageUri && styles.outlineBtnTextSuccess]}>
                      {proofImageUri ? 'Screenshot selected' : 'Upload Screenshot'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, actionLoading && styles.btnDisabled]}
                onPress={handleRecordDonation}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <View style={styles.btnInner}>
                    <Ionicons name="checkmark-done-outline" size={15} color={colors.white} />
                    <Text style={styles.primaryBtnText}>Record Donation</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Donations History */}
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Ionicons name="receipt-outline" size={13} color={colors.primaryLight} />
            <Text style={styles.sectionLabel}>DONATIONS HISTORY</Text>
          </View>
          {donationsHistory.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.emptyRow}>
                <Ionicons name="document-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.emptyText}>No donations recorded yet</Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              {donationsHistory.map((donation, index) => (
                <View key={donation.id}>
                  {editingDonation?.id === donation.id ? (
                    <View style={styles.editBlock}>
                      <Text style={styles.editBlockTitle}>{donation.charities?.name}</Text>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Amount ($)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={editAmount}
                          onChangeText={setEditAmount}
                          keyboardType="decimal-pad"
                          placeholderTextColor={colors.primaryLight}
                          returnKeyType="next"
                          onSubmitEditing={() => editTransactionIdRef.current?.focus()}
                          submitBehavior="submit"
                        />
                      </View>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Transaction ID</Text>
                        <TextInput
                          ref={editTransactionIdRef}
                          style={styles.textInput}
                          value={editTransactionId}
                          onChangeText={setEditTransactionId}
                          placeholderTextColor={colors.primaryLight}
                          returnKeyType="done"
                          onSubmitEditing={handleEditDonation}
                          submitBehavior="submit"
                        />
                      </View>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>PayPal Screenshot</Text>
                        <TouchableOpacity
                          style={[styles.outlineBtn, editProofImageUri && styles.outlineBtnSuccess]}
                          onPress={() => pickProofImage(setEditProofImageUri)}
                        >
                          <View style={styles.btnInner}>
                            <Ionicons
                              name={editProofImageUri ? 'checkmark-circle' : 'cloud-upload-outline'}
                              size={16}
                              color={editProofImageUri ? colors.success : colors.primary}
                            />
                            <Text style={[styles.outlineBtnText, editProofImageUri && styles.outlineBtnTextSuccess]}>
                              {editProofImageUri
                                ? 'New screenshot selected'
                                : editingDonation?.proof_url
                                  ? 'Replace screenshot'
                                  : 'Upload Screenshot'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.rowBtns}>
                        <TouchableOpacity style={[styles.primaryBtn, styles.halfBtn]} onPress={handleEditDonation}>
                          <Text style={styles.primaryBtnText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.outlineBtn, styles.halfBtn]} onPress={() => setEditingDonation(null)}>
                          <Text style={styles.outlineBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.donationRow}>
                      <View style={styles.donationInfo}>
                        <Text style={styles.donationName}>{donation.charities?.name}</Text>
                        <Text style={styles.donationMeta}>
                          ${parseFloat(donation.amount).toFixed(2)} · {formatDate(donation.donated_at)}
                        </Text>
                        {donation.transaction_id && (
                          <Text style={styles.donationTxn}>TXN: {donation.transaction_id}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.editIconBtn}
                        onPress={() => {
                          setEditingDonation(donation);
                          setEditAmount(donation.amount.toString());
                          setEditTransactionId(donation.transaction_id || '');
                        }}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {index < donationsHistory.length - 1 && <View style={styles.rowDivider} />}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Pending Nominations */}
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Ionicons name="flag-outline" size={13} color={colors.primaryLight} />
            <Text style={styles.sectionLabel}>PENDING NOMINATIONS</Text>
          </View>
          {pendingNominations.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.emptyText}>No pending nominations</Text>
              </View>
            </View>
          ) : (
            pendingNominations.map((charity: any) => {
              const complete = isCharityComplete(charity);
              const nominationCount = charity.nominations?.filter((n: any) => n.status === 'pending').length ?? 0;
              const isApprovingThis = nominationActionLoading === charity.id + '_approve';
              const isRejectingThis = nominationActionLoading === charity.id + '_reject';
              return (
                <View key={charity.id} style={styles.card}>
                  <View style={styles.nominationHeaderRow}>
                    <View style={styles.nominationTitleBlock}>
                      <Text style={styles.cardTitle}>{charity.name}</Text>
                      <Text style={styles.cardMeta}>EIN: {charity.ein ?? 'Not set'}</Text>
                    </View>
                    <View style={styles.nominationCountPill}>
                      <Text style={styles.nominationCountText}>{nominationCount}</Text>
                    </View>
                  </View>
                  <Text style={styles.nominationSubtext}>
                    {nominationCount} user{nominationCount !== 1 ? 's' : ''} nominated this
                  </Text>
                  {!complete && (
                    <View style={styles.warningBanner}>
                      <Ionicons name="warning-outline" size={13} color={colors.warning} />
                      <Text style={styles.warningText}>
                        Fill in all fields via Supabase dashboard to enable approval
                      </Text>
                    </View>
                  )}
                  <View style={styles.internalDivider} />
                  <View style={styles.rowBtns}>
                    <TouchableOpacity
                      style={[
                        styles.primaryBtn,
                        styles.halfBtn,
                        (!complete || nominationActionLoading !== null) && styles.btnDisabled,
                      ]}
                      onPress={() => handleApproveNomination(charity.id, charity.name)}
                      disabled={!complete || nominationActionLoading !== null}
                    >
                      {isApprovingThis ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <View style={styles.btnInner}>
                          <Ionicons name="checkmark-outline" size={14} color={colors.white} />
                          <Text style={styles.primaryBtnText}>Approve</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dangerBtn,
                        styles.halfBtn,
                        nominationActionLoading !== null && styles.btnDisabled,
                      ]}
                      onPress={() => handleRejectNomination(charity.id, charity.name)}
                      disabled={nominationActionLoading !== null}
                    >
                      {isRejectingThis ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <View style={styles.btnInner}>
                          <Ionicons name="close-outline" size={14} color={colors.white} />
                          <Text style={styles.dangerBtnText}>Reject</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Charity Management */}
        <View style={[styles.section, { paddingBottom: spacing.xxxl }]}>
          <View style={styles.sectionHeadRow}>
            <Ionicons name="heart-outline" size={13} color={colors.primaryLight} />
            <Text style={styles.sectionLabel}>CHARITY MANAGEMENT</Text>
            <TouchableOpacity style={styles.importToggleBtn} onPress={() => setShowImport(!showImport)}>
              <Ionicons name={showImport ? 'close-outline' : 'cloud-download-outline'} size={13} color={colors.white} />
              <Text style={styles.importToggleBtnText}>{showImport ? 'Cancel' : 'Import'}</Text>
            </TouchableOpacity>
          </View>

          {showImport && (
            <View style={[styles.card, { marginBottom: spacing.sm }]}>
              <Text style={styles.cardTitle}>Import from CharityAPI</Text>
              <Text style={styles.cardMeta}>
                Imports name and EIN only — fill in remaining fields via Supabase dashboard before approving.
              </Text>
              <View style={styles.internalDivider} />

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Search Term or EIN (required)</Text>
                <TextInput
                  style={styles.textInput}
                  value={importQuery}
                  onChangeText={setImportQuery}
                  placeholder="e.g. food bank  or  12-3456789"
                  placeholderTextColor={colors.primaryLight}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => importStateRef.current?.focus()}
                  submitBehavior="submit"
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldGroup, { flex: 1, marginRight: spacing.sm }]}>
                  <Text style={styles.fieldLabel}>State (optional)</Text>
                  <TextInput
                    ref={importStateRef}
                    style={styles.textInput}
                    value={importState}
                    onChangeText={setImportState}
                    placeholder="CA"
                    placeholderTextColor={colors.primaryLight}
                    autoCapitalize="characters"
                    maxLength={2}
                    returnKeyType="next"
                    onSubmitEditing={() => importCityRef.current?.focus()}
                    submitBehavior="submit"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>City (optional)</Text>
                  <TextInput
                    ref={importCityRef}
                    style={styles.textInput}
                    value={importCity}
                    onChangeText={setImportCity}
                    placeholder="Los Angeles"
                    placeholderTextColor={colors.primaryLight}
                    returnKeyType="next"
                    onSubmitEditing={() => importCountRef.current?.focus()}
                    submitBehavior="submit"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Number to Import</Text>
                <TextInput
                  ref={importCountRef}
                  style={styles.textInput}
                  value={importCount}
                  onChangeText={setImportCount}
                  keyboardType="number-pad"
                  placeholder="10"
                  placeholderTextColor={colors.primaryLight}
                  returnKeyType="done"
                  onSubmitEditing={handleImportCharities}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, importLoading && styles.btnDisabled]}
                onPress={handleImportCharities}
                disabled={importLoading}
              >
                {importLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <View style={styles.btnInner}>
                    <Ionicons name="cloud-download-outline" size={15} color={colors.white} />
                    <Text style={styles.primaryBtnText}>Import Charities</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {charities.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.emptyRow}>
                <Ionicons name="heart-dislike-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.emptyText}>No approved charities</Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              {charities.map((charity, index) => (
                <View key={charity.id}>
                  <View style={styles.charityListRow}>
                    <View style={styles.charityListInfo}>
                      <Text style={styles.charityName}>{charity.name}</Text>
                      <Text style={styles.charityCategory}>{charity.category}</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.approvalToggle,
                        charity.is_approved ? styles.approvedToggle : styles.unapprovedToggle,
                      ]}
                      onPress={() => handleToggleApproval(charity.id, charity.is_approved)}
                    >
                      <Text style={[
                        styles.approvalToggleText,
                        charity.is_approved ? styles.approvedToggleText : styles.unapprovedToggleText,
                      ]}>
                        {charity.is_approved ? 'Approved' : 'Unapproved'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {index < charities.length - 1 && <View style={styles.rowDivider} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    fontSize: typography.sizes.xxl,
    fontFamily: 'Fredoka_700Bold',
    color: colors.cardBackground,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorSubtitle: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.primaryLight,
    textAlign: 'center',
  },

  // header
  header: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.round,
    backgroundColor: 'rgba(242, 232, 220, 0.15)',
    marginRight: spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.sizes.xl,
    fontFamily: 'Fredoka_700Bold',
    color: colors.cardBackground,
  },
  adminBadge: {
    backgroundColor: 'rgba(242, 232, 220, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(242, 232, 220, 0.3)',
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  adminBadgeText: {
    color: colors.cardBackground,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
    letterSpacing: 1,
  },

  // stats Strip
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: colors.primaryDark,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.sizes.lg,
    fontFamily: 'Fredoka_700Bold',
    color: colors.cardBackground,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_400Regular',
    color: colors.primaryLight,
    marginTop: 2,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(242, 232, 220, 0.2)',
    marginVertical: spacing.xs,
  },

  scrollContent: {
    flex: 1,
  },

  // sections
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  sectionLabel: {
    flex: 1,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.primaryLight,
    letterSpacing: 1.2,
  },
  importToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.round,
    gap: 4,
  },
  importToggleBtnText: {
    color: colors.white,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
  },

  // cards
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleBlock: {
    flex: 1,
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.text,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
  },

  // status Pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(80, 200, 120, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(80, 200, 120, 0.3)',
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusPillText: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.success,
  },

  internalDivider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.5,
    marginVertical: spacing.sm,
  },

  // buttons
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    marginLeft: spacing.xs,
  },
  dangerBtn: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  dangerBtnText: {
    color: colors.white,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    marginLeft: spacing.xs,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  outlineBtnSuccess: {
    borderColor: colors.success,
    backgroundColor: 'rgba(80, 200, 120, 0.08)',
  },
  outlineBtnText: {
    color: colors.primary,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    marginLeft: spacing.xs,
  },
  outlineBtnTextSuccess: {
    color: colors.success,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  halfBtn: {
    flex: 1,
  },

  // empty states
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  emptyText: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
  },

  // period selector
  periodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  periodItemSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(89, 64, 32, 0.06)',
  },
  periodItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  periodItemDates: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.text,
  },
  periodItemWinner: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
  },

  // form
  fieldGroup: {
    marginBottom: spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.textLight,
    marginBottom: spacing.xs,
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.cardBackground,
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_400Regular',
    borderWidth: 1,
    borderColor: 'rgba(191, 163, 128, 0.4)',
  },

  // donation history rows
  donationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  donationInfo: {
    flex: 1,
  },
  donationName: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.text,
  },
  donationMeta: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  donationTxn: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_400Regular',
    color: colors.primary,
    marginTop: 2,
  },
  editIconBtn: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.round,
    backgroundColor: 'rgba(89, 64, 32, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.4,
  },
  editBlock: {
    paddingVertical: spacing.sm,
  },
  editBlockTitle: {
    fontSize: typography.sizes.md,
    fontFamily: 'Fredoka_700Bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  // nomination cards
  nominationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nominationTitleBlock: {
    flex: 1,
    marginRight: spacing.sm,
  },
  nominationCountPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.round,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nominationCountText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_700Bold',
    color: colors.white,
  },
  nominationSubtext: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(243, 156, 18, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  warningText: {
    flex: 1,
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_400Regular',
    color: colors.warning,
  },

  // Feature flag rows
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  flagInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  flagLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  flagLabel: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.text,
  },
  flagDesc: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
  },
  flagActivePill: {
    marginLeft: spacing.xs,
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  flagActivePillText: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    color: colors.error,
    letterSpacing: 0.5,
  },
  flagDisabledPill: {
    marginLeft: spacing.xs,
    backgroundColor: 'rgba(191, 163, 128, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191, 163, 128, 0.4)',
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  flagDisabledPillText: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_700Bold',
    color: colors.primaryLight,
    letterSpacing: 0.5,
  },

  // charity list rows
  charityListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  charityListInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  charityName: {
    fontSize: typography.sizes.body,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.text,
  },
  charityCategory: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Fredoka_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  approvalToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.round,
  },
  approvedToggle: {
    backgroundColor: 'rgba(80, 200, 120, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(80, 200, 120, 0.35)',
  },
  unapprovedToggle: {
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
  },
  approvalToggleText: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Fredoka_600SemiBold',
  },
  approvedToggleText: {
    color: colors.success,
  },
  unapprovedToggleText: {
    color: colors.error,
  },
});
