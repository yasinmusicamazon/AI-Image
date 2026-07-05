import { randomUUID } from "crypto";
import { getDb } from "../db/database";
import type { PromptTemplate } from "../types";

interface BuiltinTemplateSeed {
  id: string;
  name: string;
  imageStyle: string;
  thingsToAvoid: string;
  altTextRules: string;
  filenameRules: string;
  promptFormat: string;
  defaultImageCount: number;
}

const BUILTIN_TEMPLATES: BuiltinTemplateSeed[] = [
  {
    id: "builtin-healthcare",
    name: "Healthcare Treatment Website",
    imageStyle: "Calm, respectful, clinical-but-warm. Soft natural lighting, real-feeling settings (offices, consultation rooms, outdoor recovery walks). Diverse, realistic people.",
    thingsToAvoid: "No distressing medical imagery, no visible pain/suffering, no clinical gore, no stock-photo cliches (handshakes over desks), no text overlays, no logos.",
    altTextRules: "Describe the scene and its relevance to care/support; never use clinical diagnostic language a reader might self-apply.",
    filenameRules: "lowercase-hyphenated, include the core topic (e.g. mental-health-support-consultation.webp)",
    promptFormat: "A realistic, professional photograph of [scene], calm and respectful tone, natural lighting, [setting].",
    defaultImageCount: 2
  },
  {
    id: "builtin-rehab",
    name: "Rehab / Addiction Treatment Website",
    imageStyle: "Hopeful, non-triggering, calm environments (nature, group support settings, therapy rooms). Avoid anything that could read as glamorizing substance use.",
    thingsToAvoid: "No depictions of drug/alcohol use or paraphernalia, no distressing imagery, no visible intoxication, no logos, no on-image text.",
    altTextRules: "Focus on support, recovery, and connection; avoid stigmatizing language.",
    filenameRules: "lowercase-hyphenated, e.g. group-therapy-recovery-support.webp",
    promptFormat: "A realistic, hopeful photograph of [scene] related to recovery and support, natural lighting, non-clinical warmth.",
    defaultImageCount: 2
  },
  {
    id: "builtin-home-services",
    name: "Home Services Website",
    imageStyle: "Bright, clean, professional trade photography — technicians at work, finished projects, modern homes.",
    thingsToAvoid: "No brand logos on tools/vehicles, no visible company names, no unsafe work practices depicted.",
    altTextRules: "Describe the service and setting plainly, e.g. 'Technician repairing a home HVAC unit.'",
    filenameRules: "lowercase-hyphenated, e.g. hvac-technician-repair-service.webp",
    promptFormat: "A bright, professional photograph of [service scene], clean modern home setting, natural daylight.",
    defaultImageCount: 2
  },
  {
    id: "builtin-legal",
    name: "Legal Website",
    imageStyle: "Professional, trustworthy, understated — offices, consultations, courthouse exteriors (generic, not identifiable specific courts).",
    thingsToAvoid: "No visible scales-of-justice cliche overuse, no distressing legal-conflict imagery, no identifiable real people, no logos.",
    altTextRules: "Describe the professional context plainly without implying legal outcomes.",
    filenameRules: "lowercase-hyphenated, e.g. attorney-client-consultation-meeting.webp",
    promptFormat: "A professional, trustworthy photograph of [scene], modern office setting, natural lighting.",
    defaultImageCount: 2
  },
  {
    id: "builtin-insurance",
    name: "Insurance Website",
    imageStyle: "Warm, reassuring, everyday-life scenes (families, homes, vehicles, small businesses) suggesting protection and security.",
    thingsToAvoid: "No distressing accident/disaster imagery, no logos, no brand names, no on-image text.",
    altTextRules: "Describe the everyday scene and its connection to protection/security plainly.",
    filenameRules: "lowercase-hyphenated, e.g. family-home-protection-coverage.webp",
    promptFormat: "A warm, reassuring photograph of [everyday scene], natural lighting, realistic and relatable.",
    defaultImageCount: 2
  },
  {
    id: "builtin-generic-blog",
    name: "Generic SEO Blog",
    imageStyle: "Clean, modern, editorial photography style matching the article topic.",
    thingsToAvoid: "No logos, no brand names, no on-image text unless the article is specifically about that text.",
    altTextRules: "Describe the image content and its relevance to the article topic naturally.",
    filenameRules: "lowercase-hyphenated, matching the article's core keyword phrase.",
    promptFormat: "A clean, editorial-style photograph of [scene related to topic], natural lighting.",
    defaultImageCount: 2
  }
];

function nowIso(): string {
  return new Date().toISOString();
}

/** Seeds built-in templates on first run; safe to call on every startup (idempotent via id). */
export function seedBuiltinTemplates(): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO prompt_templates
     (id, name, image_style, things_to_avoid, alt_text_rules, filename_rules, prompt_format, default_image_count, is_builtin, created_at, updated_at)
     VALUES (@id, @name, @imageStyle, @thingsToAvoid, @altTextRules, @filenameRules, @promptFormat, @defaultImageCount, 1, @now, @now)`
  );
  const now = nowIso();
  const insertMany = db.transaction((templates: BuiltinTemplateSeed[]) => {
    for (const t of templates) {
      insert.run({ ...t, now });
    }
  });
  insertMany(BUILTIN_TEMPLATES);
}

function rowToTemplate(row: any): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    imageStyle: row.image_style,
    thingsToAvoid: row.things_to_avoid,
    altTextRules: row.alt_text_rules,
    filenameRules: row.filename_rules,
    promptFormat: row.prompt_format,
    defaultImageCount: row.default_image_count,
    isBuiltin: Boolean(row.is_builtin),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listTemplates(): PromptTemplate[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM prompt_templates ORDER BY is_builtin DESC, name ASC`).all();
  return rows.map(rowToTemplate);
}

export function addTemplate(input: Omit<PromptTemplate, "id" | "isBuiltin" | "createdAt" | "updatedAt">): PromptTemplate {
  const db = getDb();
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `INSERT INTO prompt_templates (id, name, image_style, things_to_avoid, alt_text_rules, filename_rules, prompt_format, default_image_count, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, input.name, input.imageStyle, input.thingsToAvoid, input.altTextRules, input.filenameRules, input.promptFormat, input.defaultImageCount, now, now);
  return rowToTemplate(db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(id));
}

export function updateTemplate(id: string, patch: Partial<PromptTemplate>): PromptTemplate {
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(id) as any;
  if (!existing) throw new Error("Template not found.");
  if (existing.is_builtin) throw new Error("Built-in templates cannot be edited. Duplicate it as a custom template instead.");

  const now = nowIso();
  db.prepare(
    `UPDATE prompt_templates SET name = ?, image_style = ?, things_to_avoid = ?, alt_text_rules = ?, filename_rules = ?, prompt_format = ?, default_image_count = ?, updated_at = ? WHERE id = ?`
  ).run(
    patch.name ?? existing.name,
    patch.imageStyle ?? existing.image_style,
    patch.thingsToAvoid ?? existing.things_to_avoid,
    patch.altTextRules ?? existing.alt_text_rules,
    patch.filenameRules ?? existing.filename_rules,
    patch.promptFormat ?? existing.prompt_format,
    patch.defaultImageCount ?? existing.default_image_count,
    now,
    id
  );
  return rowToTemplate(db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(id));
}

export function deleteTemplate(id: string): void {
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(id) as any;
  if (!existing) return;
  if (existing.is_builtin) throw new Error("Built-in templates cannot be deleted.");
  db.prepare(`DELETE FROM prompt_templates WHERE id = ?`).run(id);
}
