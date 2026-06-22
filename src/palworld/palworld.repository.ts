import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DataTableExport, ItemDocument, ListQuery, PalDocument } from './palworld.types';

type Rows = Record<string, Record<string, unknown>>;
type TextMap = Map<string, string>;
type TextIndex = {
  exact: TextMap;
  lower: TextMap;
};
type PalParameterRow = {
  palId: string;
  sourceId: string;
  elements: string[];
  rarity: number | null;
  zukanIndex: number | null;
  zukanIndexSuffix: string;
  isBoss: boolean;
};

const ROOT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Mapeamentos pt-BR para tags inline sem DataTable fonte (portado do paldium).
// ---------------------------------------------------------------------------
const UI_COMMON: Record<string, string> = {
  COMMON_ELEMENT_NAME_Fire: 'Fogo',
  COMMON_ELEMENT_NAME_Aqua: 'Água',
  COMMON_ELEMENT_NAME_Electricity: 'Eletricidade',
  COMMON_ELEMENT_NAME_Ice: 'Gelo',
  COMMON_ELEMENT_NAME_Earth: 'Terra',
  COMMON_ELEMENT_NAME_Dark: 'Trevas',
  COMMON_ELEMENT_NAME_Dragon: 'Dragão',
  COMMON_ELEMENT_NAME_Grass: 'Planta',
  COMMON_ELEMENT_NAME_Normal: 'Normal',
  COMMON_CONDITION_NAME_Cold: 'Resfriado',
  COMMON_CONDITION_NAME_Sprain: 'Entorse',
  COMMON_CONDITION_NAME_Bulimia: 'Bulimia',
  COMMON_CONDITION_NAME_GastricUlcer: 'Úlcera Gástrica',
  COMMON_CONDITION_NAME_Fracture: 'Fratura',
  COMMON_CONDITION_NAME_Weakness: 'Fraqueza',
  COMMON_CONDITION_NAME_DepressionSprain: 'Depressão',
  COMMON_STATUS_RANGE_ATTACK: 'Ataque a Distância',
  COMMON_STATUS_MELEE_ATTACK: 'Ataque Corpo a Corpo',
  COMMON_STATUS_DEFENCE: 'Defesa',
  COMMON_STATUS_HP: 'PV',
  RARITY_COMMON: 'Comum',
  RARITY_UNCOMMON: 'Incomum',
  RARITY_RARE: 'Raro',
  RARITY_EPIC: 'Épico',
  RARITY_LEGENDARY: 'Lendário',
};

const MAP_OBJECTS: Record<string, string> = {
  WorkBench: 'Bancada de Trabalho',
  Furnace: 'Fornalha',
  Campfire: 'Fogueira',
  CookingPot: 'Panela',
  Mill: 'Moinho',
};

// Nomes placeholder que nao sao traducoes reais (en_text, pt-BR_Text, etc).
const PLACEHOLDER_NAME = /^(?:en_text|pt-br_text|ja_text|ko_text|zh-hans_text|zh-hant_text|xx_text)$/i;

function camelToReadable(code: string): string {
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

function isPlaceholderName(name: string): boolean {
  return PLACEHOLDER_NAME.test(name);
}

@Injectable()
export class PalworldRepository {
  private pals = new Map<string, PalDocument>();
  private items = new Map<string, ItemDocument>();
  private loadedAt = new Date();

  constructor() {
    this.reload();
  }

  reload() {
    const palNames = this.readTextTable('L10N/pt-BR/Pal/DataTable/Text/DT_PalNameText_Common.json', 'PAL_NAME_');
    const palDescriptions = this.readTextTable(
      'L10N/pt-BR/Pal/DataTable/Text/DT_PalLongDescriptionText.json',
      'PAL_LONG_DESC_',
    );
    const itemNames = this.readTextTable('L10N/pt-BR/Pal/DataTable/Text/DT_ItemNameText_Common.json', 'ITEM_NAME_');
    const itemDescriptions = this.readTextTable(
      'L10N/pt-BR/Pal/DataTable/Text/DT_ItemDescriptionText_Common.json',
      'ITEM_DESC_',
    );

    const palIcons = {
      ...this.readIconRows('DataTable/Character/DT_PalCharacterIconDataTable_Common.json'),
      ...this.readIconRows('DataTable/Character/DT_PalCharacterIconDataTable_SkinOverride_Common.json'),
    };
    const palModels = this.readModelRows('DataTable/Character/DT_PalBPClass_Common.json');
    const palLevels = this.readPalLevelRows('DataTable/Character/DT_CapturedCagePal.json');
    const palParameters = this.readPalParameterRows(
      'DataTable/Character/DT_PalMonsterParameter_Common.json',
      new Set(palNames.exact.keys()),
    );
    const itemIcons = this.readIconRows('DataTable/Item/DT_ItemIconDataTable_Common.json');
    const itemRows = this.readRows('DataTable/Item/DT_ItemDataTable_Common.json');

    const palEntries: Array<[string, PalDocument]> = [];
    for (const parameter of palParameters) {
        const palId = parameter.palId;
        const description = this.resolvePalText(palDescriptions, palId) ?? '';
        const icon = this.resolvePalIcon(palIcons, palId);
        if (!icon) continue;

        const name = this.resolvePalText(palNames, palId) ?? palId;
        if (isPlaceholderName(name)) continue;

        palEntries.push([
          palId,
          {
            palId,
            name,
            description: this.resolveTextReferences(description, palNames, itemNames),
            icon,
            model: palModels[palId] ?? null,
            elements: parameter.elements,
            minLevel: palLevels[palId]?.minLevel ?? null,
            maxLevel: palLevels[palId]?.maxLevel ?? null,
            rarity: parameter.rarity,
            zukanIndex: parameter.zukanIndex,
            zukanIndexSuffix: parameter.zukanIndexSuffix,
            isBoss: parameter.isBoss,
          },
        ]);
      }
    this.pals = new Map(palEntries);

    this.items = new Map(
      Object.entries(itemRows).flatMap(([itemId, row]): Array<[string, ItemDocument]> => {
        const iconId = typeof row.IconName === 'string' && row.IconName !== 'None' ? row.IconName : itemId;
        const nameKey = typeof row.OverrideName === 'string' && row.OverrideName !== 'None' ? row.OverrideName : itemId;
        const descKey =
          typeof row.OverrideDescription === 'string' && row.OverrideDescription !== 'None'
            ? row.OverrideDescription.replace(/^ITEM_DESC_/, '')
            : itemId;

        const name = this.resolveItemText(itemNames, nameKey.replace(/^ITEM_NAME_/, '')) ?? itemId;
        if (isPlaceholderName(name)) return [];

        return [
          [
            itemId,
            {
              itemId,
              name,
              icon: itemIcons[iconId] ?? itemIcons[itemId] ?? null,
              description: this.resolveTextReferences(
                this.resolveItemText(itemDescriptions, descKey) ?? '',
                palNames,
                itemNames,
              ),
            },
          ],
        ];
      }),
    );

    this.loadedAt = new Date();
  }

  getStats() {
    return {
      loadedAt: this.loadedAt.toISOString(),
      pals: this.pals.size,
      items: this.items.size,
      sourceRoot: ROOT,
    };
  }

  listPals(query: ListQuery = {}) {
    return this.filter([...this.pals.values()], query);
  }

  listItems(query: ListQuery = {}) {
    return this.filter([...this.items.values()], query);
  }

  getPal(palId: string) {
    const pal = this.pals.get(palId);
    if (!pal) throw new NotFoundException(`Pal '${palId}' not found`);
    return pal;
  }

  getItem(itemId: string) {
    const item = this.items.get(itemId);
    if (!item) throw new NotFoundException(`Item '${itemId}' not found`);
    return item;
  }

  private filter<T extends { name: string; minLevel?: unknown; maxLevel?: unknown }>(documents: T[], query: ListQuery) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const search = query.search?.trim().toLowerCase();
    const searchable = search
      ? documents.filter((document) => JSON.stringify(document).toLowerCase().includes(search))
      : documents;
    const filtered =
      typeof query.level === 'number'
        ? searchable.filter((document) => this.documentMatchesLevel(document, query.level ?? 1))
        : searchable;

    return {
      total: filtered.length,
      offset,
      limit,
      data: filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).slice(offset, offset + limit),
    };
  }

  private documentMatchesLevel(document: { minLevel?: unknown; maxLevel?: unknown }, level: number) {
    if (typeof document.minLevel !== 'number' || typeof document.maxLevel !== 'number') return false;
    return document.minLevel <= level && document.maxLevel >= level;
  }

  private readTextTable(relativePath: string, prefix: string): TextIndex {
    const exact = new Map<string, string>();
    const lower = new Map<string, string>();
    for (const [key, row] of Object.entries(this.readRows(relativePath))) {
      const textData = row.TextData as { LocalizedString?: unknown; SourceString?: unknown } | undefined;
      const raw = textData?.LocalizedString ?? textData?.SourceString;
      if (typeof raw === 'string') {
        const normalizedKey = key.replace(prefix, '');
        const value = this.fixMojibake(raw);
        exact.set(normalizedKey, value);
        lower.set(normalizedKey.toLowerCase(), value);
      }
    }
    return { exact, lower };
  }

  private resolvePalText(index: TextIndex, palId: string) {
    for (const candidate of this.palTextCandidates(palId)) {
      const exact = index.exact.get(candidate);
      if (exact !== undefined) return exact;

      const lower = index.lower.get(candidate.toLowerCase());
      if (lower !== undefined) return lower;
    }

    return undefined;
  }

  private resolveItemText(index: TextIndex, itemId: string) {
    return index.exact.get(itemId) ?? index.lower.get(itemId.toLowerCase());
  }

  private resolveTextReferences(value: string, palNames: TextIndex, itemNames: TextIndex) {
    if (!value) return '';
    return (
      value
        .replace(/<characterName id=\|([^|]+)\|\/>/g, (_, palId: string) => this.resolvePalText(palNames, palId) ?? palId)
        .replace(/<itemName id=\|([^|]+)\|\/>/g, (_, itemId: string) => this.resolveItemText(itemNames, itemId) ?? itemId)
        .replace(/<uiCommon id=\|([^|]+)\|\/>/g, (_, code: string) => UI_COMMON[code] ?? camelToReadable(code))
        .replace(/<[Mm]apObjectName id=\|([^|]+)\|\/>/g, (_, code: string) => MAP_OBJECTS[code] ?? camelToReadable(code))
        // Fallback generico: qualquer tag inline restante (<activeSkillName>, etc).
        .replace(
          /<[a-zA-Z]+ id=\|([^|]+)\|\/>/g,
          (_, code: string) => this.resolveItemText(itemNames, code) ?? this.resolvePalText(palNames, code) ?? camelToReadable(code),
        )
        .replace(/\r\n/g, '\n')
    );
  }

  private palTextCandidates(palId: string) {
    const withoutPrefix = palId.replace(/^(BOSS_|Boss_|PREDATOR_|Predator_|RAID_|Raid_)/, '');
    const withoutSkin = withoutPrefix.replace(/_Skin\d+$/i, '');
    const withoutEventSuffix = withoutSkin.replace(/_Oilrig$/i, '');
    const progressiveBaseIds = withoutEventSuffix
      .split('_')
      .map((_, index, parts) => parts.slice(0, parts.length - index).join('_'))
      .filter(Boolean);

    return [...new Set([palId, withoutPrefix, withoutSkin, withoutEventSuffix, ...progressiveBaseIds])];
  }

  private resolvePalIcon(palIcons: Record<string, string>, palId: string) {
    for (const candidate of this.palTextCandidates(palId)) {
      const tableIcon = palIcons[candidate];
      if (tableIcon) return tableIcon;

      const normalIcon = this.palIconFileToUrl('Normal', candidate);
      if (normalIcon) return normalIcon;

      const npcIcon = this.palIconFileToUrl('NPC', candidate);
      if (npcIcon) return npcIcon;
    }

    return null;
  }

  private palIconFileToUrl(folder: string, palId: string) {
    const fileNames = [
      `T_${palId}_icon_normal.png`,
      `T_${palId}_Icon_Normal.png`,
      `T_${palId}.png`,
    ];

    for (const fileName of fileNames) {
      const relativePath = join('Pal', 'Texture', 'PalIcon', folder, fileName);
      if (existsSync(join(ROOT, 'Game', relativePath))) {
        return `/api/assets/${relativePath.replace(/\\/g, '/')}`;
      }
    }

    return null;
  }

  private readIconRows(relativePath: string): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.readRows(relativePath))
        .map(([id, row]) => [id, this.assetToUrl(this.getAssetPath(row.Icon))])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }

  private readModelRows(relativePath: string): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.readRows(relativePath))
        .map(([id, row]) => [id, this.getAssetPath(row.BPClass)])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }

  private readPalLevelRows(relativePath: string): Record<string, { minLevel: number; maxLevel: number }> {
    const levels: Record<string, { minLevel: number; maxLevel: number }> = {};

    for (const row of Object.values(this.readRows(relativePath))) {
      const palId = typeof row.PalId === 'string' ? row.PalId : null;
      const minLevel = typeof row.MinLevel === 'number' ? row.MinLevel : null;
      const maxLevel = typeof row.MaxLevel === 'number' ? row.MaxLevel : null;
      if (!palId || minLevel === null || maxLevel === null) continue;

      const current = levels[palId];
      levels[palId] = current
        ? {
            minLevel: Math.min(current.minLevel, minLevel),
            maxLevel: Math.max(current.maxLevel, maxLevel),
          }
        : { minLevel, maxLevel };
    }

    return levels;
  }

  private readPalParameterRows(relativePath: string, nameCodes: Set<string>): PalParameterRow[] {
    const byPalId = new Map<string, PalParameterRow>();

    for (const [sourceId, row] of Object.entries(this.readRows(relativePath))) {
      if (row.IsPal !== true) continue;
      if (this.hasTechnicalPrefix(sourceId)) continue;
      if (sourceId.startsWith('NPC_') || sourceId.startsWith('Human_')) continue;
      // Variantes elementais tem id com '_' (ex.: CaptainPenguin_Black = "Penking
      // Lux") e SAO pals distintos: incluimos quando possuem nome proprio. Id com
      // '_' sem nome proprio e forma tecnica/alternativa -> ignora.
      if (sourceId.includes('_') && !nameCodes.has(sourceId)) continue;

      const palId = sourceId;

      const parameter: PalParameterRow = {
        palId,
        sourceId,
        elements: this.readPalElements(row),
        rarity: typeof row.Rarity === 'number' ? row.Rarity : null,
        zukanIndex: typeof row.ZukanIndex === 'number' ? row.ZukanIndex : null,
        zukanIndexSuffix: typeof row.ZukanIndexSuffix === 'string' ? row.ZukanIndexSuffix : '',
        isBoss: row.IsBoss === true,
      };
      const current = byPalId.get(palId);
      if (!current || this.palParameterPriority(parameter) > this.palParameterPriority(current)) {
        byPalId.set(palId, parameter);
      }
    }

    return [...byPalId.values()].sort((left, right) => {
      const leftIndex = left.zukanIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.zukanIndex ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      if (left.zukanIndexSuffix !== right.zukanIndexSuffix) {
        return left.zukanIndexSuffix.localeCompare(right.zukanIndexSuffix);
      }
      return left.palId.localeCompare(right.palId);
    });
  }

  private palParameterPriority(row: PalParameterRow) {
    let priority = 0;
    if (!row.isBoss) priority += 10;
    if ((row.zukanIndex ?? -1) > 0) priority += 5;
    if (!row.sourceId.includes('_')) priority += 2;
    return priority;
  }

  private readPalElements(row: Record<string, unknown>) {
    return [row.ElementType1, row.ElementType2]
      .map((value) => (typeof value === 'string' ? value.replace(/^EPalElementType::/, '') : null))
      .filter((value): value is string => Boolean(value && value !== 'None'));
  }

  private hasTechnicalPrefix(value: string) {
    return /^(BOSS_|Boss_|PREDATOR_|Predator_|RAID_|Raid_)/.test(value);
  }

  private readRows(relativePath: string): Rows {
    const path = join(ROOT, relativePath);
    if (!existsSync(path)) {
      throw new Error(`Required DataTable not found: ${relativePath}`);
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as DataTableExport;
    const rows = parsed[0]?.Rows;
    if (!rows) {
      throw new Error(`Required DataTable has no rows: ${relativePath}`);
    }

    return rows;
  }

  private getAssetPath(value: unknown) {
    if (!value || typeof value !== 'object') return null;
    const assetPath = (value as { AssetPathName?: unknown }).AssetPathName;
    return typeof assetPath === 'string' && assetPath !== 'None' ? assetPath : null;
  }

  private assetToUrl(assetPath: string | null) {
    if (!assetPath?.startsWith('/Game/')) return null;
    const withoutObjectName = assetPath.slice('/Game/'.length).split('.')[0];
    return `/api/assets/${withoutObjectName}.png`;
  }

  private fixMojibake(value: string) {
    return /Ã|Â/.test(value) ? Buffer.from(value, 'latin1').toString('utf8') : value;
  }
}
