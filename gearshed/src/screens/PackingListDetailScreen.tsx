import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { useGearStore } from '../store/useGearStore';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PackingListDetail'>;

export default function PackingListDetailScreen({ route }: Props) {
  const { listId } = route.params;
  const list = useGearStore((s) => s.packingLists.find((l) => l.id === listId));
  const items = useGearStore((s) => s.items);
  const togglePacked = useGearStore((s) => s.togglePacked);
  const toggleListItem = useGearStore((s) => s.toggleListItem);
  const [editing, setEditing] = useState(false);

  const entries = useMemo(() => {
    if (!list) return [];
    return list.items
      .map((li) => ({ li, gear: items.find((g) => g.id === li.gearId) }))
      .filter((e): e is { li: (typeof list.items)[number]; gear: (typeof items)[number] } => !!e.gear);
  }, [list, items]);

  const totalWeight = useMemo(
    () =>
      entries.reduce((sum, e) => sum + (e.gear.weightGrams ?? 0) * e.gear.quantity, 0),
    [entries],
  );

  if (!list) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.inkSoft }}>This list was deleted.</Text>
      </View>
    );
  }

  const packedCount = entries.filter((e) => e.li.packed).length;
  const inListIds = new Set(list.items.map((li) => li.gearId));
  const notInList = items.filter((g) => !inListIds.has(g.id));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 96 }}>
        <Text style={styles.progressLine}>
          {packedCount} of {entries.length} packed
          {totalWeight > 0 ? ` · ${(totalWeight / 1000).toFixed(1)} kg total` : ''}
        </Text>

        {entries.length === 0 && (
          <EmptyState
            title="Nothing in this list"
            hint='Tap "Edit items" to add gear from your inventory.'
          />
        )}

        {entries.map(({ li, gear }) => (
          <Pressable
            key={gear.id}
            style={styles.row}
            onPress={() => togglePacked(list.id, gear.id)}
          >
            <Text style={{ fontSize: 18 }}>{li.packed ? '✅' : '⬜️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, li.packed && styles.rowPacked]}>
                {gear.quantity > 1 ? `${gear.quantity}× ` : ''}
                {gear.name}
              </Text>
              <Text style={styles.rowMeta}>{gear.category}</Text>
            </View>
            {editing && (
              <Pressable onPress={() => toggleListItem(list.id, gear.id)} style={styles.removeBtn}>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text>
              </Pressable>
            )}
          </Pressable>
        ))}

        {editing && notInList.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Add from inventory</Text>
            {notInList.map((gear) => (
              <Pressable
                key={gear.id}
                style={[styles.row, { opacity: 0.85 }]}
                onPress={() => toggleListItem(list.id, gear.id)}
              >
                <Text style={{ fontSize: 18 }}>➕</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{gear.name}</Text>
                  <Text style={styles.rowMeta}>{gear.category}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={editing ? 'Done editing' : 'Edit items'}
          kind={editing ? 'primary' : 'secondary'}
          onPress={() => setEditing((e) => !e)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  progressLine: { fontSize: 14, color: colors.inkSoft, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowPacked: { textDecorationLine: 'line-through', color: colors.inkFaint },
  rowMeta: { fontSize: 12, color: colors.inkFaint, marginTop: 2 },
  removeBtn: { paddingHorizontal: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
});
