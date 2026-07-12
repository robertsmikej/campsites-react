import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Chip, EmptyState, FieldLabel } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { useGearStore } from '../store/useGearStore';
import { colors, radius, spacing } from '../theme';
import { TRIP_TYPES, TripType } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PackingListsScreen() {
  const navigation = useNavigation<Nav>();
  const lists = useGearStore((s) => s.packingLists);
  const createPackingList = useGearStore((s) => s.createPackingList);
  const removePackingList = useGearStore((s) => s.removePackingList);
  const itemCount = useGearStore((s) => s.items.length);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [tripType, setTripType] = useState<TripType>('car-camping');

  const create = () => {
    const listId = createPackingList(name.trim() || `${tripType} trip`, tripType);
    setCreating(false);
    setName('');
    navigation.navigate('PackingListDetail', { listId });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Packing Lists</Text>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}
        ListEmptyComponent={
          <EmptyState
            title="No packing lists yet"
            hint={
              itemCount === 0
                ? 'Scan some gear first, then generate a packing list for your next trip.'
                : 'Create a list below — it auto-fills from your inventory based on the trip type.'
            }
          />
        }
        renderItem={({ item: list }) => {
          const packed = list.items.filter((i) => i.packed).length;
          return (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('PackingListDetail', { listId: list.id })}
              onLongPress={() =>
                Alert.alert('Delete list', `Delete "${list.name}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => removePackingList(list.id) },
                ])
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.listName}>{list.name}</Text>
                <Text style={styles.listMeta}>{list.tripType}</Text>
              </View>
              <Text style={styles.progress}>
                {packed}/{list.items.length}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={styles.footer}>
        {creating ? (
          <View style={styles.createBox}>
            <FieldLabel>Trip name</FieldLabel>
            <TextInput
              style={styles.input}
              value={name}
              placeholder="e.g. Moab long weekend"
              placeholderTextColor={colors.inkFaint}
              onChangeText={setName}
            />
            <FieldLabel>Trip type (auto-fills matching gear)</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {TRIP_TYPES.map((t) => (
                <Chip key={t} label={t} active={tripType === t} onPress={() => setTripType(t)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button label="Create" onPress={create} style={{ flex: 1 }} />
              <Button label="Cancel" kind="secondary" onPress={() => setCreating(false)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button label="+ New packing list" onPress={() => setCreating(true)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  listName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  listMeta: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  progress: { fontSize: 15, fontWeight: '800', color: colors.forest },
  footer: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
  createBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
});
