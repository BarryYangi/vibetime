import { estimateUsageCostUsd, lookupUsagePrice } from './pricing.js'
import {
  USAGE_AGENTS,
  type UsageAgent,
  type UsageAuditRow,
  type UsagePricingEntry,
  type UsageRecordFact,
  type UsageSummary,
  type UsageSummaryArgs,
  type UsageSummaryBreakdownRow,
  type UsageSummaryTotals,
  type UsageTokenBreakdown,
} from './types.js'

const EMPTY_TOKENS: UsageTokenBreakdown = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
}

type Accumulator = {
  tokens: UsageTokenBreakdown
  estimatedCostUsd: number
  hasKnownCost: boolean
  unknownCostTokens: number
  recordCount: number
}

function createAccumulator(): Accumulator {
  return {
    tokens: { ...EMPTY_TOKENS },
    estimatedCostUsd: 0,
    hasKnownCost: false,
    unknownCostTokens: 0,
    recordCount: 0,
  }
}

function addTokens(target: UsageTokenBreakdown, source: UsageTokenBreakdown): void {
  target.inputTokens += source.inputTokens
  target.cachedInputTokens += source.cachedInputTokens
  target.cacheCreationInputTokens += source.cacheCreationInputTokens
  target.outputTokens += source.outputTokens
  target.reasoningOutputTokens += source.reasoningOutputTokens
  target.totalTokens += source.totalTokens
}

function addRecord(
  accumulator: Accumulator,
  record: UsageRecordFact,
  prices: readonly UsagePricingEntry[],
): void {
  addTokens(accumulator.tokens, record.tokens)
  accumulator.recordCount += 1

  const cost = estimateUsageCostUsd(record.tokens, lookupUsagePrice(record.model, prices))
  if (cost === null) {
    accumulator.unknownCostTokens += record.tokens.totalTokens
    return
  }

  accumulator.estimatedCostUsd += cost
  accumulator.hasKnownCost = true
}

function totalsFromAccumulator(accumulator: Accumulator): UsageSummaryTotals {
  return {
    totalTokens: accumulator.tokens.totalTokens,
    estimatedCostUsd: accumulator.hasKnownCost ? accumulator.estimatedCostUsd : null,
    unknownCostTokens: accumulator.unknownCostTokens,
    recordCount: accumulator.recordCount,
  }
}

function toBreakdownRows(groups: Map<string, Accumulator>): UsageSummaryBreakdownRow[] {
  return Array.from(groups.entries())
    .map(([key, accumulator]) => ({
      key,
      label: key,
      tokens: accumulator.tokens,
      totalTokens: accumulator.tokens.totalTokens,
      estimatedCostUsd: accumulator.hasKnownCost ? accumulator.estimatedCostUsd : null,
      unknownCostTokens: accumulator.unknownCostTokens,
      recordCount: accumulator.recordCount,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || a.key.localeCompare(b.key))
}

function startOfLocalDay(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

function toDateKey(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-CA')
}

function denseDateKeys(days: number, now: Date): string[] {
  const endDay = startOfLocalDay(now)
  const firstDay = endDay - (days - 1) * 86400
  return Array.from({ length: days }, (_, index) => toDateKey(firstDay + index * 86400))
}

function isAllowedUsageAgent(agent: string, agents: readonly UsageAgent[]): agent is UsageAgent {
  return (agents as readonly string[]).includes(agent)
}

function upsertGroup(groups: Map<string, Accumulator>, key: string): Accumulator {
  let group = groups.get(key)
  if (!group) {
    group = createAccumulator()
    groups.set(key, group)
  }
  return group
}

export function buildUsageSummary(
  records: UsageRecordFact[],
  options: UsageSummaryArgs,
): UsageSummary {
  const now = options.now ?? new Date()
  const agents = options.agents ?? USAGE_AGENTS
  const prices = options.prices ?? []
  const rangeEnd = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const rangeStart = rangeEnd - options.periodDays * 86400
  const totals = createAccumulator()
  const daily = new Map(
    denseDateKeys(options.periodDays, now).map((date) => [date, createAccumulator()]),
  )
  const byAgent = new Map<string, Accumulator>()
  const byModel = new Map<string, Accumulator>()
  const byProject = new Map<string, Accumulator>()
  const unknownPriceByModel = new Map<string, Accumulator>()
  const unassigned = createAccumulator()
  const availableAgents = new Set<UsageAgent>()
  const availableModels = new Set<string>()
  const availableProjects = new Set<string>()

  for (const record of records) {
    if (!isAllowedUsageAgent(record.agent, agents)) continue
    if (typeof record.ts !== 'number' || record.ts < rangeStart || record.ts >= rangeEnd) continue

    addRecord(totals, record, prices)
    addRecord(upsertGroup(byAgent, record.agent), record, prices)
    addRecord(upsertGroup(byModel, record.model), record, prices)
    availableAgents.add(record.agent)
    availableModels.add(record.model)

    const date = toDateKey(record.ts)
    const day = daily.get(date)
    if (day) addRecord(day, record, prices)

    if (record.project) {
      addRecord(upsertGroup(byProject, record.project), record, prices)
      availableProjects.add(record.project)
    } else {
      addRecord(unassigned, record, prices)
    }

    if (estimateUsageCostUsd(record.tokens, lookupUsagePrice(record.model, prices)) === null) {
      addRecord(upsertGroup(unknownPriceByModel, record.model), record, prices)
    }
  }

  const auditRows: UsageAuditRow[] = toBreakdownRows(unknownPriceByModel).map((row) => ({
    key: `unknown-price:${row.key}`,
    label: 'Cost unknown for this model.',
    model: row.key,
    totalTokens: row.totalTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    unknownCostTokens: row.unknownCostTokens,
    recordCount: row.recordCount,
  }))

  if (unassigned.recordCount > 0) {
    auditRows.push({
      key: 'unassigned',
      label: 'Unassigned usage',
      project: null,
      attributionMethod: 'unmatched',
      ...totalsFromAccumulator(unassigned),
    })
  }

  return {
    periodDays: options.periodDays,
    totals: totalsFromAccumulator(totals),
    daily: Array.from(daily.entries()).map(([date, accumulator]) => ({
      date,
      ...totalsFromAccumulator(accumulator),
    })),
    pricingStatus: options.pricingStatus ?? 'refresh_failed_without_cache',
    tokenBreakdown: totals.tokens,
    byAgent: toBreakdownRows(byAgent),
    byModel: toBreakdownRows(byModel),
    byProject: toBreakdownRows(byProject),
    auditRows,
    availableFilters: {
      agents: USAGE_AGENTS.filter((agent) => availableAgents.has(agent)),
      models: Array.from(availableModels).sort((a, b) => a.localeCompare(b)),
      projects: Array.from(availableProjects).sort((a, b) => a.localeCompare(b)),
    },
  }
}
