import { createUsagePriceResolver, estimateUsageCostUsd } from './pricing.js'
import {
  USAGE_AGENTS,
  type UsageAgent,
  type UsageAttributionSummaryRow,
  type UsageAuditRow,
  type UsageDataQualitySummary,
  type UsageEfficiencySummary,
  type UsageMetricPeriodComparison,
  type UsagePeriodComparison,
  type UsagePricingEntry,
  type UsageProjectModelMatrixCell,
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

const EMPTY_EFFICIENCY: UsageEfficiencySummary = {
  totals: {
    durationSec: 0,
    turnCount: 0,
    costPerHourUsd: null,
    costPerTurnUsd: null,
    tokensPerTurn: null,
  },
  daily: [],
  byAgent: [],
  byModel: [],
  byProject: [],
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
  resolvePrice: ReturnType<typeof createUsagePriceResolver>,
): void {
  addTokens(accumulator.tokens, record.tokens)
  accumulator.recordCount += 1

  const resolved = resolvePrice(record.model, {
    agent: record.agent,
    provider: record.meta?.modelProvider ?? null,
  })
  const cost = estimateUsageCostUsd(record.tokens, resolved.price, {
    codexServiceTier: record.meta?.codexServiceTier ?? null,
  })
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

function toProjectModelMatrixRows(
  groups: Map<string, { project: string; model: string; accumulator: Accumulator }>,
): UsageProjectModelMatrixCell[] {
  return Array.from(groups.values())
    .map(({ project, model, accumulator }) => ({
      project,
      model,
      totalTokens: accumulator.tokens.totalTokens,
      estimatedCostUsd: accumulator.hasKnownCost ? accumulator.estimatedCostUsd : null,
      unknownCostTokens: accumulator.unknownCostTokens,
      recordCount: accumulator.recordCount,
    }))
    .sort(
      (a, b) =>
        (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0) ||
        b.totalTokens - a.totalTokens ||
        a.project.localeCompare(b.project) ||
        a.model.localeCompare(b.model),
    )
}

function toAttributionRows(groups: Map<string, Accumulator>): UsageAttributionSummaryRow[] {
  return Array.from(groups.entries())
    .map(([method, accumulator]) => ({
      method: method as UsageAttributionSummaryRow['method'],
      totalTokens: accumulator.tokens.totalTokens,
      estimatedCostUsd: accumulator.hasKnownCost ? accumulator.estimatedCostUsd : null,
      unknownCostTokens: accumulator.unknownCostTokens,
      recordCount: accumulator.recordCount,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || a.method.localeCompare(b.method))
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

function upsertProjectModelGroup(
  groups: Map<string, { project: string; model: string; accumulator: Accumulator }>,
  project: string,
  model: string,
): Accumulator {
  const key = `${project}\u0000${model}`
  let group = groups.get(key)
  if (!group) {
    group = { project, model, accumulator: createAccumulator() }
    groups.set(key, group)
  }
  return group.accumulator
}

function hasAnyUsablePrice(price: UsagePricingEntry | null): boolean {
  return (
    price !== null &&
    (price.inputUsdPerMillion !== null ||
      price.cachedInputUsdPerMillion !== null ||
      price.cacheCreationInputUsdPerMillion !== null ||
      price.outputUsdPerMillion !== null ||
      price.reasoningOutputUsdPerMillion !== null)
  )
}

function compareNullableMetric(
  currentValue: number | null,
  previousValue: number | null,
  hasPreviousData: boolean,
): UsageMetricPeriodComparison {
  if (!hasPreviousData || currentValue === null || previousValue === null) {
    return { previousValue: null, delta: null, deltaRatio: null }
  }

  const delta = currentValue - previousValue
  return {
    previousValue,
    delta,
    deltaRatio: previousValue === 0 ? null : delta / previousValue,
  }
}

export function buildUsagePeriodCompare(
  current: UsageSummary,
  previous: UsageSummary,
): UsagePeriodComparison {
  return {
    estimatedCostUsd: compareNullableMetric(
      current.totals.estimatedCostUsd,
      previous.totals.estimatedCostUsd,
      previous.totals.recordCount > 0,
    ),
    costPerHourUsd: compareNullableMetric(
      current.efficiency.totals.costPerHourUsd,
      previous.efficiency.totals.costPerHourUsd,
      previous.efficiency.totals.durationSec > 0,
    ),
  }
}

export function buildUsageSummary(
  records: UsageRecordFact[],
  options: UsageSummaryArgs,
): UsageSummary {
  const now = options.now ?? new Date()
  const agents = options.agents ?? USAGE_AGENTS
  const prices = options.prices ?? []
  const resolvePrice = createUsagePriceResolver(prices)
  const rangeEnd = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const rangeStart = rangeEnd - options.periodDays * 86400
  const totals = createAccumulator()
  const daily = new Map(
    denseDateKeys(options.periodDays, now).map((date) => [date, createAccumulator()]),
  )
  const byAgent = new Map<string, Accumulator>()
  const byModel = new Map<string, Accumulator>()
  const byProject = new Map<string, Accumulator>()
  const byProjectModel = new Map<
    string,
    { project: string; model: string; accumulator: Accumulator }
  >()
  const byAttribution = new Map<string, Accumulator>()
  const unknownPriceByModel = new Map<string, Accumulator>()
  const unassigned = createAccumulator()
  const availableAgents = new Set<UsageAgent>()
  const availableModels = new Set<string>()
  const availableProjects = new Set<string>()

  for (const record of records) {
    if (!isAllowedUsageAgent(record.agent, agents)) continue
    if (typeof record.ts !== 'number' || record.ts < rangeStart || record.ts >= rangeEnd) continue

    addRecord(totals, record, resolvePrice)
    addRecord(upsertGroup(byAgent, record.agent), record, resolvePrice)
    addRecord(upsertGroup(byModel, record.model), record, resolvePrice)
    addRecord(upsertGroup(byAttribution, record.attributionMethod), record, resolvePrice)
    availableAgents.add(record.agent)
    availableModels.add(record.model)

    const date = toDateKey(record.ts)
    const day = daily.get(date)
    if (day) addRecord(day, record, resolvePrice)

    if (record.project) {
      addRecord(upsertGroup(byProject, record.project), record, resolvePrice)
      addRecord(
        upsertProjectModelGroup(byProjectModel, record.project, record.model),
        record,
        resolvePrice,
      )
      availableProjects.add(record.project)
    } else {
      addRecord(unassigned, record, resolvePrice)
    }

    const priceResolution = resolvePrice(record.model, {
      agent: record.agent,
      provider: record.meta?.modelProvider ?? null,
    })
    if (priceResolution.matchKind === 'unknown') {
      addRecord(upsertGroup(unknownPriceByModel, record.model), record, resolvePrice)
    }
  }

  const unknownPriceTotals = Array.from(unknownPriceByModel.values()).reduce(
    (accumulator, group) => {
      addTokens(accumulator.tokens, group.tokens)
      accumulator.recordCount += group.recordCount
      accumulator.unknownCostTokens += group.unknownCostTokens
      accumulator.estimatedCostUsd += group.estimatedCostUsd
      accumulator.hasKnownCost = accumulator.hasKnownCost || group.hasKnownCost
      return accumulator
    },
    createAccumulator(),
  )

  const dataQuality: UsageDataQualitySummary = {
    assignedRecordCount: totals.recordCount - unassigned.recordCount,
    unassigned: totalsFromAccumulator(unassigned),
    unknownPrice: totalsFromAccumulator(unknownPriceTotals),
    attribution: toAttributionRows(byAttribution),
  }

  const auditRows: UsageAuditRow[] = toBreakdownRows(unknownPriceByModel).map((row) => {
    const hasModelPrice = hasAnyUsablePrice(resolvePrice(row.key).price)
    return {
      key: `unknown-price:${row.key}`,
      label: hasModelPrice ? 'Some token categories lack pricing' : 'Cost unknown for this model',
      model: row.key,
      totalTokens: row.totalTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      unknownCostTokens: row.unknownCostTokens,
      recordCount: row.recordCount,
    }
  })

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
      tokens: accumulator.tokens,
    })),
    pricingStatus: options.pricingStatus ?? 'refresh_failed_without_cache',
    tokenBreakdown: totals.tokens,
    byAgent: toBreakdownRows(byAgent),
    byModel: toBreakdownRows(byModel),
    byProject: toBreakdownRows(byProject),
    projectModelMatrix: toProjectModelMatrixRows(byProjectModel),
    efficiency: EMPTY_EFFICIENCY,
    dataQuality,
    auditRows,
    availableFilters: {
      agents: USAGE_AGENTS.filter((agent) => availableAgents.has(agent)),
      models: Array.from(availableModels).sort((a, b) => a.localeCompare(b)),
      projects: Array.from(availableProjects).sort((a, b) => a.localeCompare(b)),
    },
  }
}
