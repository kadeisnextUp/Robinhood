import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Fake charity data for now
const charities = [
  { id: 1, name: "Clean Water Fund", description: "Providing clean water to communities in need" },
  { id: 2, name: "Food Bank Alliance", description: "Fighting hunger across America" },
  { id: 3, name: "Education for All", description: "Building schools in underserved areas" },
  { id: 4, name: "Animal Rescue Network", description: "Saving and rehoming abandoned pets" },
  { id: 5, name: "Medical Aid International", description: "Providing healthcare to remote regions" },
];

export default function HomeScreen() {
  const handleVote = (charityName) => {
    alert(`You voted for ${charityName}!`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Vote for This Week's Charity</Text>
      
      <ScrollView style={styles.charityList}>
        {charities.map((charity) => (
          <View key={charity.id} style={styles.charityCard}>
            <Text style={styles.charityName}>{charity.name}</Text>
            <Text style={styles.charityDescription}>{charity.description}</Text>
            <TouchableOpacity 
              style={styles.voteButton}
              onPress={() => handleVote(charity.name)}
            >
              <Text style={styles.voteButtonText}>Vote</Text>
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
    backgroundColor: '#f5f5f5',
    paddingTop: 50,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  charityList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  charityCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  charityName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  charityDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  voteButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  voteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});