import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Chip, EmptyState, Stars } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { useGearStore } from '../store/useGearStore';
import { colors, radius, spacing } from '../theme';
import { GEAR_CATEGORIES, GearCategory, GearItem, makeId } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function InventoryScreen() {
  const navigation = useNavigation<Nav>();
  const items = useGearStore((s) => s.items);
  const addItems = useGearStore((s) => s.addItems);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GearCategory | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) =>
        (category === 'all' || it.category === category) &&
        (!q || it.name.toLowerCase().includes(q) || (it.brand ?? '').toLowerCase().includes(q)),
    );
  }, [items, query, category]);

  const addManualItem = () => {
    const item: GearItem = {
      id: makeId(),
      name: 'New gear item',
      category: 'other',
      quantity: 1,
      rating: 0,
      notes: '',
      source: 'manual',
      createdAt: Date.now(),
    };
    addItems([item]);
    navigation.navigate('GearDetail', { gearId: item.id });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Gear</Text>
        <Text style={styles.subtitle}>
          {items.length} item{items.length === 1 ? '' : 's'}
        </Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search gear…"
        placeholderTextColor={colors.inkFaint}
        value={query}
        onChangeText={setQuery}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={{ paddingHorizontal: spacing.md }}
      >
        <Chip label="all" active={category === 'all'} onPress={() => setCategory('all')} />
        {GEAR_CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 96 }}
        ListEmptyComponent={
          <EmptyState
            title={items.length === 0 ? 'No gear yet' : 'No matches'}
            hint={
              items.length === 0
                ? 'Scan a photo of your gear pile from the Scan tab, or add an item manually below.'
                : 'Try a different search or category.'
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('GearDetail', { gearId: item.id })}
          >
            {item.photoUri ? (
              <Image source={{ uri: item.photoUri }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={{ fontSize: 22 }}>🏕️</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.quantity > 1 ? `${item.quantity}× ` : ''}
                {item.name}
              </Text>
              <Text style={styles.itemMeta}>
                {item.category}
                {item.brand ? ` · ${item.brand}` : ''}
              </Text>
              {item.rating > 0 && <Stars rating={item.rating} size={14} />}
            </View>
          </Pressable>
        )}
      />

      <View style={styles.fabWrap}>
        <Button label="+ Add manually" onPress={addManualItem} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 14, color: colors.inkSoft },
  search: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  chipRow: { marginTop: spacing.md, flexGrow: 0 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  thumbPlaceholder: {
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  itemMeta: { fontSize: 13, color: colors.inkSoft, marginTop: 2, marginBottom: 4 },
  fabWrap: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
});
