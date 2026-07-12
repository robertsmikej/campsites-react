import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Chip, FieldLabel, Stars } from '../components/ui';
import { RootStackParamList } from '../navigation';
import {
  amazonAffiliateUrl,
  googleReviewsUrl,
  reiSearchUrl,
  youtubeReviewsUrl,
} from '../services/links';
import { useGearStore } from '../store/useGearStore';
import { colors, radius, spacing } from '../theme';
import { GEAR_CATEGORIES } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'GearDetail'>;

export default function GearDetailScreen({ route, navigation }: Props) {
  const { gearId } = route.params;
  const item = useGearStore((s) => s.items.find((it) => it.id === gearId));
  const updateItem = useGearStore((s) => s.updateItem);
  const removeItem = useGearStore((s) => s.removeItem);
  const affiliateTag = useGearStore((s) => s.settings.amazonAffiliateTag);

  if (!item) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.inkSoft }}>This item was removed.</Text>
      </View>
    );
  }

  const open = (url: string) => Linking.openURL(url).catch(() => undefined);

  const confirmDelete = () =>
    Alert.alert('Remove item', `Remove "${item.name}" from your inventory?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeItem(item.id);
          navigation.goBack();
        },
      },
    ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md, paddingBottom: 48 }}>
      {item.photoUri && (
        <Image source={{ uri: item.photoUri }} style={styles.photo} resizeMode="cover" />
      )}

      <FieldLabel>Name</FieldLabel>
      <TextInput
        style={styles.input}
        value={item.name}
        onChangeText={(t) => updateItem(item.id, { name: t })}
      />

      <FieldLabel>Brand</FieldLabel>
      <TextInput
        style={styles.input}
        value={item.brand ?? ''}
        placeholder="e.g. MSR, Coleman, Dometic"
        placeholderTextColor={colors.inkFaint}
        onChangeText={(t) => updateItem(item.id, { brand: t || undefined })}
      />

      <FieldLabel>Category</FieldLabel>
      <View style={styles.chipWrap}>
        {GEAR_CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={c}
            active={item.category === c}
            onPress={() => updateItem(item.id, { category: c })}
          />
        ))}
      </View>

      <FieldLabel>Quantity</FieldLabel>
      <View style={styles.stepper}>
        <Pressable
          style={styles.stepBtn}
          onPress={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{item.quantity}</Text>
        <Pressable
          style={styles.stepBtn}
          onPress={() => updateItem(item.id, { quantity: item.quantity + 1 })}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>

      <FieldLabel>My rating</FieldLabel>
      <Stars rating={item.rating} onChange={(r) => updateItem(item.id, { rating: r })} size={30} />

      <FieldLabel>Weight (grams)</FieldLabel>
      <TextInput
        style={styles.input}
        value={item.weightGrams != null ? String(item.weightGrams) : ''}
        placeholder="Optional — used for pack weight totals"
        placeholderTextColor={colors.inkFaint}
        keyboardType="number-pad"
        onChangeText={(t) => {
          const n = parseInt(t, 10);
          updateItem(item.id, { weightGrams: Number.isFinite(n) ? n : undefined });
        }}
      />

      <FieldLabel>My notes / mini-review</FieldLabel>
      <TextInput
        style={[styles.input, styles.notes]}
        value={item.notes}
        placeholder="How has it held up? Would you buy it again?"
        placeholderTextColor={colors.inkFaint}
        multiline
        onChangeText={(t) => updateItem(item.id, { notes: t })}
      />

      <FieldLabel>Research & buy</FieldLabel>
      <View style={{ gap: spacing.sm }}>
        <Button label="🛒  Find on Amazon" onPress={() => open(amazonAffiliateUrl(item, affiliateTag))} />
        <Button label="🏔  REI listings" kind="secondary" onPress={() => open(reiSearchUrl(item))} />
        <Button label="▶️  YouTube reviews" kind="secondary" onPress={() => open(youtubeReviewsUrl(item))} />
        <Button label="🔎  Google reviews" kind="secondary" onPress={() => open(googleReviewsUrl(item))} />
      </View>
      {affiliateTag.trim() !== '' && (
        <Text style={styles.affiliateNote}>Amazon links include your affiliate tag "{affiliateTag.trim()}".</Text>
      )}

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Remove from inventory" kind="danger" onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.moss,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  notes: { minHeight: 90, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '700', color: colors.forestDark },
  stepValue: { fontSize: 18, fontWeight: '700', color: colors.ink, minWidth: 28, textAlign: 'center' },
  affiliateNote: { fontSize: 12, color: colors.inkFaint, marginTop: spacing.sm },
});
