import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Button } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { useGearStore } from '../store/useGearStore';
import { colors, radius, spacing } from '../theme';
import { GEAR_CATEGORIES, GearItem, makeId } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewDetections'>;

interface Draft {
  key: number;
  name: string;
  category: (typeof GEAR_CATEGORIES)[number];
  brand: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
  keep: boolean;
}

export default function ReviewDetectionsScreen({ route, navigation }: Props) {
  const { photoUri, photoWidth, photoHeight, result } = route.params;
  const addItems = useGearStore((s) => s.addItems);
  const { width: screenWidth } = useWindowDimensions();

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    result.items.map((it, i) => ({
      key: i,
      name: it.name,
      category: it.category,
      brand: it.brandGuess ?? '',
      confidence: it.confidence,
      box: it.box,
      keep: true,
    })),
  );

  // Display the photo at full width, preserving aspect ratio, so normalized
  // bounding boxes map 1:1 onto the displayed image.
  const displayW = screenWidth - spacing.md * 2;
  const displayH = photoWidth > 0 ? (photoHeight / photoWidth) * displayW : displayW;

  const keptCount = useMemo(() => drafts.filter((d) => d.keep).length, [drafts]);

  const updateDraft = (key: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const cycleCategory = (d: Draft) => {
    const idx = GEAR_CATEGORIES.indexOf(d.category);
    updateDraft(d.key, { category: GEAR_CATEGORIES[(idx + 1) % GEAR_CATEGORIES.length] });
  };

  const save = () => {
    const items: GearItem[] = drafts
      .filter((d) => d.keep)
      .map((d) => ({
        id: makeId(),
        name: d.name.trim() || 'Unnamed gear',
        category: d.category,
        brand: d.brand.trim() || undefined,
        quantity: 1,
        rating: 0,
        notes: '',
        photoUri,
        box: d.box,
        source: 'scan' as const,
        createdAt: Date.now(),
      }));
    addItems(items);
    navigation.popToTop();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}>
        <Text style={styles.summary}>{result.sceneSummary}</Text>

        <View style={{ width: displayW, height: displayH, marginTop: spacing.md }}>
          <Image
            source={{ uri: photoUri }}
            style={{ width: displayW, height: displayH, borderRadius: radius.md }}
          />
          {drafts.map((d) => (
            <Pressable
              key={d.key}
              onPress={() => updateDraft(d.key, { keep: !d.keep })}
              style={[
                styles.box,
                {
                  left: d.box.x * displayW,
                  top: d.box.y * displayH,
                  width: d.box.w * displayW,
                  height: d.box.h * displayH,
                  borderColor: d.keep ? colors.boxKeep : colors.boxDrop,
                },
              ]}
            >
              <View
                style={[
                  styles.boxTag,
                  { backgroundColor: d.keep ? colors.boxKeep : colors.boxDrop },
                ]}
              >
                <Text style={styles.boxTagText} numberOfLines={1}>
                  {d.key + 1}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Tap a box to keep or discard that detection.</Text>

        {drafts.map((d) => (
          <View key={d.key} style={[styles.card, !d.keep && { opacity: 0.45 }]}>
            <Pressable style={styles.keepToggle} onPress={() => updateDraft(d.key, { keep: !d.keep })}>
              <Text style={{ fontSize: 18 }}>{d.keep ? '✅' : '⬜️'}</Text>
              <Text style={styles.cardIndex}>#{d.key + 1}</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.nameInput}
                value={d.name}
                onChangeText={(t) => updateDraft(d.key, { name: t })}
              />
              <View style={styles.metaRow}>
                <Pressable style={styles.categoryPill} onPress={() => cycleCategory(d)}>
                  <Text style={styles.categoryPillText}>{d.category} ↻</Text>
                </Pressable>
                <Text style={styles.confidence}>
                  {Math.round(d.confidence * 100)}% confident
                </Text>
              </View>
              <TextInput
                style={styles.brandInput}
                value={d.brand}
                placeholder="Brand (optional)"
                placeholderTextColor={colors.inkFaint}
                onChangeText={(t) => updateDraft(d.key, { brand: t })}
              />
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={`Add ${keptCount} item${keptCount === 1 ? '' : 's'} to inventory`}
          onPress={save}
          disabled={keptCount === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summary: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
  },
  boxTag: {
    position: 'absolute',
    top: -1,
    left: -1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderTopLeftRadius: 3,
    borderBottomRightRadius: 6,
  },
  boxTagText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  hint: {
    fontSize: 12,
    color: colors.inkFaint,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  keepToggle: { alignItems: 'center', gap: 2 },
  cardIndex: { fontSize: 11, fontWeight: '700', color: colors.inkFaint },
  nameInput: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  categoryPill: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryPillText: { color: colors.forestDark, fontSize: 12, fontWeight: '700' },
  confidence: { fontSize: 12, color: colors.inkFaint },
  brandInput: {
    fontSize: 13,
    color: colors.ink,
    marginTop: spacing.sm,
    paddingVertical: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
