export interface CodexTranscriptCandidate {
  transcriptPath: string
  content: string
}

export interface FindCodexTurnCompletionInTranscriptsInput {
  turnId: string
  startedAt: number
  transcripts: CodexTranscriptCandidate[]
}

export interface CodexTurnCompletion {
  completedAt: number
  transcriptPath: string
}

function parseTimestamp(timestamp: string | undefined): number {
  return timestamp ? new Date(timestamp).getTime() / 1000 : NaN
}

export function findCodexTurnCompletionInTranscripts(
  input: FindCodexTurnCompletionInTranscriptsInput,
): CodexTurnCompletion | null {
  for (const transcript of input.transcripts) {
    for (const line of transcript.content.split('\n')) {
      if (!line.trim()) continue

      try {
        const record = JSON.parse(line) as {
          timestamp?: string
          payload?: { type?: string; turn_id?: string; completed_at?: unknown }
        }

        const payloadType = record.payload?.type
        if (
          (payloadType !== 'task_complete' && payloadType !== 'turn_aborted') ||
          record.payload?.turn_id !== input.turnId
        ) {
          continue
        }

        const payloadCompletedAt =
          typeof record.payload.completed_at === 'number' ? record.payload.completed_at : NaN
        const timestampCompletedAt = parseTimestamp(record.timestamp)
        const completedAt =
          Number.isFinite(payloadCompletedAt) && payloadCompletedAt >= input.startedAt
            ? payloadCompletedAt
            : timestampCompletedAt

        if (!Number.isFinite(completedAt) || completedAt < input.startedAt) continue

        return { completedAt, transcriptPath: transcript.transcriptPath }
      } catch {
        // Codex transcripts can contain non-JSON diagnostic lines; ignore them.
      }
    }
  }

  return null
}
