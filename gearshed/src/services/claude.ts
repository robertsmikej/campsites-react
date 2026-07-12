import Anthropic from '@anthropic-ai/sdk';
import { DetectionResult, DetectedItem, GEAR_CATEGORIES, GearCategory } from '../types';

const MODEL = 'claude-opus-4-8';

const SYSTEM_PROMPT = `You are a camping and overlanding gear recognition expert inside the GearShed app.
The user sends a photo of camping/overlanding gear: a packed campsite, a pile of gear in a garage,
an open truck bed, shelves, etc. Identify each distinct piece of gear.

Rules:
- One entry per distinct physical item (or tight group of identical items, e.g. "4 tent stakes").
- Use short, specific names a gear list would use ("2-person dome tent", "20L jerry can", "propane stove").
- box is a normalized bounding box: x,y is the top-left corner, w,h the size, all values between 0 and 1
  relative to the full image. Boxes should tightly enclose the item.
- brand_guess: the brand name only if a logo or distinctive design is clearly visible, otherwise null.
- confidence: your confidence between 0 and 1 that the item is what you named it.
- Skip things that are not gear (people, pets, vehicles themselves, buildings, vegetation).
- scene_summary: one sentence describing the scene.`;

const DETECTION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: [...GEAR_CATEGORIES] },
          brand_guess: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          confidence: { type: 'number' },
          box: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
            required: ['x', 'y', 'w', 'h'],
            additionalProperties: false,
          },
        },
        required: ['name', 'category', 'brand_guess', 'confidence', 'box'],
        additionalProperties: false,
      },
    },
    scene_summary: { type: 'string' },
  },
  required: ['items', 'scene_summary'],
  additionalProperties: false,
} as const;

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function normalizeMediaType(mimeType?: string): ImageMediaType {
  switch (mimeType) {
    case 'image/png':
    case 'image/webp':
    case 'image/gif':
      return mimeType;
    default:
      return 'image/jpeg';
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface RawDetectedItem {
  name: string;
  category: string;
  brand_guess: string | null;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}

function toDetectedItem(raw: RawDetectedItem): DetectedItem {
  const category = (GEAR_CATEGORIES as readonly string[]).includes(raw.category)
    ? (raw.category as GearCategory)
    : 'other';
  return {
    name: raw.name,
    category,
    brandGuess: raw.brand_guess,
    confidence: clamp01(raw.confidence),
    box: {
      x: clamp01(raw.box.x),
      y: clamp01(raw.box.y),
      w: clamp01(raw.box.w),
      h: clamp01(raw.box.h),
    },
  };
}

/**
 * Send a photo to Claude vision and get back detected gear with bounding boxes.
 *
 * NOTE: calling the Anthropic API directly from the app is fine for personal use and
 * development. For a public App Store release, route this call through your own backend
 * so the API key never ships inside the binary.
 */
export async function detectGearInPhoto(
  base64: string,
  mimeType: string | undefined,
  apiKey: string,
): Promise<DetectionResult> {
  const client = new Anthropic({
    apiKey,
    // Required because React Native looks like a browser-ish runtime to the SDK.
    // See the note above about proxying through a backend for production releases.
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: DETECTION_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: normalizeMediaType(mimeType), data: base64 },
          },
          {
            type: 'text',
            text: 'Identify every piece of camping/overlanding gear in this photo.',
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The AI declined to analyze this photo. Try a different one.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('The AI returned no detections. Try a clearer photo.');
  }

  const parsed = JSON.parse(textBlock.text) as {
    items: RawDetectedItem[];
    scene_summary: string;
  };

  return {
    items: parsed.items.map(toDetectedItem),
    sceneSummary: parsed.scene_summary,
  };
}

/** Sample detections so the app is fully usable before an API key is configured. */
export function mockDetectGear(): Promise<DetectionResult> {
  const items: DetectedItem[] = [
    {
      name: '2-person dome tent (packed)',
      category: 'shelter',
      brandGuess: null,
      confidence: 0.93,
      box: { x: 0.06, y: 0.12, w: 0.34, h: 0.28 },
    },
    {
      name: 'Sleeping bag, mummy style',
      category: 'sleep',
      brandGuess: null,
      confidence: 0.88,
      box: { x: 0.46, y: 0.1, w: 0.3, h: 0.24 },
    },
    {
      name: 'Two-burner propane camp stove',
      category: 'kitchen',
      brandGuess: 'Coleman',
      confidence: 0.91,
      box: { x: 0.1, y: 0.48, w: 0.38, h: 0.22 },
    },
    {
      name: '20L water jug',
      category: 'water',
      brandGuess: null,
      confidence: 0.84,
      box: { x: 0.55, y: 0.44, w: 0.2, h: 0.3 },
    },
    {
      name: 'LED lantern',
      category: 'lighting',
      brandGuess: null,
      confidence: 0.8,
      box: { x: 0.8, y: 0.5, w: 0.14, h: 0.2 },
    },
    {
      name: 'Recovery boards (pair)',
      category: 'recovery',
      brandGuess: 'Maxtrax',
      confidence: 0.77,
      box: { x: 0.05, y: 0.76, w: 0.42, h: 0.18 },
    },
    {
      name: 'Camp chair, folding',
      category: 'furniture',
      brandGuess: null,
      confidence: 0.86,
      box: { x: 0.55, y: 0.72, w: 0.3, h: 0.24 },
    },
  ];
  const result: DetectionResult = {
    items,
    sceneSummary: 'Sample detections (mock mode) — add your Anthropic API key in Settings to analyze real photos.',
  };
  // Small delay so the scanning state is visible in the UI.
  return new Promise((resolve) => setTimeout(() => resolve(result), 900));
}
